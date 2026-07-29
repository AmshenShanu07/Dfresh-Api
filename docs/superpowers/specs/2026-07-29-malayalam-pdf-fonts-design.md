# Malayalam Font Support in Invoice PDFs

**Date:** 2026-07-29
**Component:** `backend/src/core/order/invoice.service.ts`
**Status:** Design approved, pending implementation

## Problem

`Products.name` is a single free-text column that holds Malayalam ("ചീര"), English
("Spinach"), or mixed ("Spinach / ചീര") values. `InvoiceService` renders every string
with pdfkit's built-in `Helvetica`, one of the Standard-14 AFM fonts, which is
WinAnsi-encoded and Latin-only. Malayalam text therefore cannot render at all.

The same limitation already forced amounts to print as `Rs.` instead of `₹`
(documented at `invoice.service.ts:15-16`).

Affected surfaces: the A4 bill (`generateBill`) and the 80mm×100mm product label
(`generateLabel`), plus their `GET /order/:id/bill` and `/items/:itemId/label`
endpoints and the WhatsApp auto-send on confirm.

## Critical constraint: fontkit crashes on common Malayalam

pdfkit delegates shaping to `fontkit@2.0.4`. That version — **the latest published
release**, so there is no upgrade path — throws while shaping many ordinary Malayalam
words:

```
TypeError: Cannot read properties of null (reading 'xCoordinate')
    at ...getAnchor (fontkit/dist/main.cjs:9989)
```

This is a hard crash, not a rendering artifact. It would return HTTP 500 from the bill
endpoint. Measured on a 7-word sample of produce names, 3 crashed:

| Input | Gloss | fontkit 2.0.4 |
|---|---|---|
| `ചീര` | spinach | ok |
| `തക്കാളി` | tomato | ok |
| `മുരിങ്ങയ്ക്ക` | drumstick | **crash** |
| `വെണ്ടയ്ക്ക` | okra | **crash** |
| `കാബേജ്` | cabbage | **crash** |

Cause isolated to the `abvm` (above-base mark positioning) feature: fontkit's Indic
shaper applies it and dereferences a null anchor. Disabling **only** `abvm` resolves
every case; disabling `blwm`, `mark`, `mkmk`, `dist`, or `kern` does not.

Verified no visual cost: output with `abvm` disabled was compared glyph-for-glyph
against a browser/HarfBuzz rendering of the same strings in the same font and matches,
including conjuncts (ക്ക, ങ്ങ, ണ്ട, ച്ച) and chandrakkala placement. This font's only
substantive positioning feature is `kern`, which is unaffected.

## Design

### Font

Noto Sans Malayalam, **static** `Regular` + `Bold` instances (OFL-1.1, ~326KB each),
vendored at `backend/src/assets/fonts/`. Source: the `notofonts/malayalam` v2.104
release archive.

Under `src/` deliberately: nest-cli `assets` globs resolve relative to `sourceRoot`
(`src`), so a top-level `backend/assets/` would never be copied into `dist/`. Placing
them under `src/` also makes one relative path correct in every context —
`path.join(__dirname, '../../assets/fonts')` resolves to `src/assets/fonts` under
ts-jest and `dist/assets/fonts` under a built process.

Static rather than the variable `NotoSansMalayalam[wdth,wght].ttf` because a real Bold
instance is needed — the bill sets product names and totals in bold. (The variable file
crashes identically, so this choice is about weight availability, not the bug.)

Confirmed to cover every character the invoice emits — full ASCII, `•` (U+2022) and
`₹` (U+20B9) — in both weights. pdfkit subsets on embed, so PDF size growth is modest.

### Font application: Noto everywhere

The document sets Noto Sans Malayalam as its only typeface; the 13 `Helvetica` /
`Helvetica-Bold` calls are replaced by `NotoML` / `NotoML-Bold`. No per-string
script detection.

Rejected alternative — per-string switching (Helvetica for Latin, Noto for Malayalam) —
because it puts two typefaces on one page for the common mixed-language bill, and every
call site becomes a place the font can be chosen wrongly. Uniformity is worth the
slight appearance change to existing all-English bills.

### Crash mitigation: one choke point

`abvm` must be disabled on every text call; a single missed call site is a production
crash. Rather than editing all 28 `text()` call sites, `render()` wraps the document's `text` method
once, immediately after construction, so no call site can opt out:

```ts
private harden(doc: PDFKit.PDFDocument): PDFKit.PDFDocument {
  const orig = doc.text.bind(doc);
  (doc as any).text = (text: any, x?: any, y?: any, options?: any) => {
    if (x && typeof x === 'object') return orig(text, { features: ABVM_OFF, ...x });
    if (y && typeof y === 'object') return orig(text, x, { features: ABVM_OFF, ...y });
    return orig(text, x, y, { features: ABVM_OFF, ...(options || {}) });
  };
  return doc;
}
```

Spread order lets an explicit caller-supplied `features` win. Verified against all four
pdfkit `text()` call shapes used in the file, plus the `continued: true` chain in
`generateLabel`'s `field()` helper.

### Build

`nest-cli.json` currently has no `assets` key, so non-TS files are not copied to
`dist/`. Add:

```json
"compilerOptions": {
  "deleteOutDir": true,
  "assets": ["assets/fonts/*.ttf"],
  "watchAssets": true
}
```

`watchAssets` keeps `start:dev` working after a font change. `deleteOutDir` already
wipes `dist/` per build, so assets are recopied each time.

Font paths resolve from `__dirname`, not `process.cwd()`, so they hold under `nest
start`, a built `dist/` process, and ts-jest alike.

### Scope

Per decision, this covers rendering only. Static page chrome (`D-FRESH`, `Bill To:`,
`Qty`, `Grand Total`) stays English; only its typeface changes. No translation table,
no schema change, no separate Malayalam name column.

## Rupee glyph (opt-in, separately revertable)

Because Noto covers U+20B9, `money()` can return `₹ 250.00` instead of `Rs. 250.00`,
and the stale comment at `invoice.service.ts:15-16` can be deleted. Isolated to one
helper and trivially revertable if the printed bills are preferred as-is.

## Testing

Note on what actually fails today: `Helvetica` does **not** throw on Malayalam input —
it silently renders blank/notdef glyphs. So a "does not throw" assertion passes today
and cannot drive the work. The red-first test must assert the font is *embedded*.

- Unit (red-first): `generateBill` for a product named `വെണ്ടയ്ക്ക` produces a buffer
  containing `NotoSansMalayalam`. Fails today (Helvetica is embedded instead), passes
  once the font is wired up. pdfkit emits subset names of the form
  `DZZZZZ+NotoSansMalayalam-Regular`, so a substring check is sufficient.
- Unit (crash guard): the same call must not throw. Passes today only because Helvetica
  never invokes fontkit; it becomes meaningful once Noto is registered, and goes red if
  the `abvm` workaround is ever removed.
- Unit: `generateLabel` resolves for the same item (covers the `continued` chain).
- Unit: mixed name `Spinach / ചീര` resolves.
- Assert each returns a non-empty `Buffer` starting with `%PDF`.
- Manual: render one bill and one label with mixed-script names and eyeball conjuncts.

## Risks

- **fontkit has no upstream fix.** If a future pdfkit bumps fontkit and changes shaping
  behaviour, the `abvm` workaround needs re-verification. The unit test above catches
  regression at CI time.
- **Coverage is font-specific.** Swapping the font later requires re-running the
  glyph-coverage and crash checks.
- The `abvm` disable is verified against a sample, not exhaustively over all Malayalam.
  The choke point means a novel crashing sequence would still fail loudly rather than
  render wrongly.
