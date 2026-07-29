# Malayalam PDF Font Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `InvoiceService` render Malayalam product names correctly in the bill and label PDFs, without crashing on common Malayalam words.

**Architecture:** Vendor Noto Sans Malayalam (static Regular + Bold) under `src/assets/fonts/`, register it as the invoice document's only typeface in place of Helvetica, and wrap the document's `text()` method once so every call disables the `abvm` OpenType feature — the feature that makes `fontkit@2.0.4` crash on Malayalam conjuncts.

**Tech Stack:** NestJS 10, pdfkit 0.19.1, fontkit 2.0.4 (transitive), Jest + ts-jest.

**Spec:** `backend/docs/superpowers/specs/2026-07-29-malayalam-pdf-fonts-design.md`

## Global Constraints

- All paths are relative to `backend/` unless stated otherwise. Run all commands from `backend/`.
- Font files: `NotoSansMalayalam-Regular.ttf` and `NotoSansMalayalam-Bold.ttf`, static instances only. Do **not** use the variable `NotoSansMalayalam[wdth,wght].ttf` — it crashes identically and provides no usable Bold.
- pdfkit font aliases registered in this work are exactly `NotoML` and `NotoML-Bold`.
- The `abvm` OpenType feature must be disabled on every text call. Disabling `blwm`, `mark`, `mkmk`, `dist`, or `kern` does **not** fix the crash and must not be used instead.
- Font paths must resolve from `__dirname`, never `process.cwd()`.
- Existing behaviour of `deriveOrderNumber`, stock, and status logic is out of scope — this work touches rendering only.
- Do not reformat or restructure unrelated parts of `invoice.service.ts`.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/assets/fonts/NotoSansMalayalam-Regular.ttf` | Create. Body text weight. |
| `src/assets/fonts/NotoSansMalayalam-Bold.ttf` | Create. Headings, product names, totals. |
| `src/assets/fonts/OFL.txt` | Create. License, required by OFL-1.1 for redistribution. |
| `nest-cli.json` | Modify. Add `assets` + `watchAssets` so `.ttf` files reach `dist/`. |
| `src/core/order/invoice.service.ts` | Modify. Register fonts, add `harden()`, swap 13 Helvetica calls. |
| `src/core/order/invoice-malayalam.spec.ts` | Create. Font-embedding test + crash guard. |

---

### Task 1: Vendor the fonts and make the build copy them

**Files:**
- Create: `src/assets/fonts/NotoSansMalayalam-Regular.ttf`
- Create: `src/assets/fonts/NotoSansMalayalam-Bold.ttf`
- Create: `src/assets/fonts/OFL.txt`
- Modify: `nest-cli.json`

**Interfaces:**
- Consumes: nothing.
- Produces: two font files at `src/assets/fonts/`, present in `dist/assets/fonts/` after `npm run build`. Task 2 loads them via `path.join(__dirname, '../../assets/fonts', <filename>)`.

- [ ] **Step 1: Download and vendor the font files**

```bash
curl -sL -o /tmp/nsm.zip "https://github.com/notofonts/malayalam/releases/download/NotoSansMalayalam-v2.104/NotoSansMalayalam-v2.104.zip"
unzip -q -o /tmp/nsm.zip -d /tmp/nsm
mkdir -p src/assets/fonts
cp /tmp/nsm/NotoSansMalayalam/full/ttf/NotoSansMalayalam-Regular.ttf src/assets/fonts/
cp /tmp/nsm/NotoSansMalayalam/full/ttf/NotoSansMalayalam-Bold.ttf src/assets/fonts/
cp /tmp/nsm/OFL.txt src/assets/fonts/
```

- [ ] **Step 2: Verify the files are real TrueType, not an HTML error page**

```bash
file src/assets/fonts/*.ttf
```

Expected: both lines say `TrueType Font data`. If either says `HTML document text`, the URL 404'd — stop and re-check the release tag.

- [ ] **Step 3: Add the assets rule to `nest-cli.json`**

Replace the `compilerOptions` block with:

```json
  "compilerOptions": {
    "deleteOutDir": true,
    "assets": ["assets/fonts/*.ttf"],
    "watchAssets": true
  }
```

The glob is relative to `sourceRoot` (`src`), so it matches `src/assets/fonts/*.ttf`. A top-level `backend/assets/` would **not** be copied.

- [ ] **Step 4: Verify the build copies them**

```bash
npm run build && ls -la dist/assets/fonts/
```

Expected: both `.ttf` files present in `dist/assets/fonts/`.

- [ ] **Step 5: Commit**

```bash
git add src/assets/fonts nest-cli.json
git commit -m "chore: vendor Noto Sans Malayalam and copy fonts to dist"
```

---

### Task 2: Render Malayalam in the bill and label

**Files:**
- Test: `src/core/order/invoice-malayalam.spec.ts` (create)
- Modify: `src/core/order/invoice.service.ts`

**Interfaces:**
- Consumes: font files from Task 1 at `src/assets/fonts/`.
- Produces: no public API change. `generateBill(order)` and `generateLabel(item, order)` keep their existing signatures and still return `Promise<Buffer>`.

- [ ] **Step 1: Write the failing test**

Create `src/core/order/invoice-malayalam.spec.ts`:

```typescript
import { InvoiceService } from './invoice.service';

/**
 * Guards two distinct failures:
 *
 * 1. Malayalam product names must actually render. pdfkit's built-in Helvetica is
 *    Latin-only and silently emits blank/notdef glyphs rather than throwing, so the
 *    meaningful assertion is that a Malayalam-capable font is *embedded*.
 * 2. fontkit@2.0.4 hard-crashes shaping common Malayalam conjuncts
 *    ("Cannot read properties of null (reading 'xCoordinate')") unless the `abvm`
 *    OpenType feature is disabled. "വെണ്ടയ്ക്ക" (okra) reproduces it.
 */
const order = (productName: string) => ({
  id: 'ord-1',
  createdAt: new Date('2026-07-29T10:00:00Z'),
  status: 'CONFIRMED',
  paymentMethod: 'COD',
  totalAmount: 250,
  user: { name: 'Test Customer', phone: '9999999999' },
  deliveryDetails: { name: 'Test Customer', phone: '9999999999', address: 'Kochi', pinCode: '682001' },
  orderItems: [
    {
      id: 'item-1',
      quantity: 2,
      price: 125,
      totalPrice: 250,
      cleaning: false,
      cutting: false,
      product: { name: productName },
      variant: { weight: 500 },
    },
  ],
});

describe('InvoiceService — Malayalam', () => {
  const service = new InvoiceService();

  it('embeds a Malayalam-capable font in the bill', async () => {
    const buf = await service.generateBill(order('വെണ്ടയ്ക്ക'));
    expect(buf.subarray(0, 4).toString()).toBe('%PDF');
    expect(buf.toString('latin1')).toContain('NotoSansMalayalam');
  });

  it('does not crash shaping conjunct-heavy Malayalam', async () => {
    for (const name of ['മുരിങ്ങയ്ക്ക', 'വെണ്ടയ്ക്ക', 'കാബേജ്', 'പച്ചമുളക്']) {
      const buf = await service.generateBill(order(name));
      expect(buf.length).toBeGreaterThan(0);
    }
  });

  it('renders a mixed English/Malayalam name', async () => {
    const buf = await service.generateBill(order('Spinach / ചീര'));
    expect(buf.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('renders the label, including its continued-text chain', async () => {
    const o = order('വെണ്ടയ്ക്ക');
    const buf = await service.generateLabel(o.orderItems[0], o);
    expect(buf.subarray(0, 4).toString()).toBe('%PDF');
    expect(buf.toString('latin1')).toContain('NotoSansMalayalam');
  });
});
```

- [ ] **Step 2: Run it and confirm the first test fails**

```bash
npx jest invoice-malayalam -t 'embeds a Malayalam-capable font'
```

Expected: FAIL. The buffer contains `Helvetica`, not `NotoSansMalayalam`.

Note: the "does not crash" test **passes** at this point — Helvetica never invokes fontkit. It only becomes meaningful after Step 3, which is why Step 4 exists.

- [ ] **Step 3: Register the fonts and swap every Helvetica reference**

In `src/core/order/invoice.service.ts`, add to the imports at the top:

```typescript
import { join } from 'path';
```

Add these two class members immediately after `private readonly address = 'Kochi, Kerala, India';`:

```typescript
  private readonly fontDir = join(__dirname, '../../assets/fonts');
  private readonly fonts = {
    regular: join(this.fontDir, 'NotoSansMalayalam-Regular.ttf'),
    bold: join(this.fontDir, 'NotoSansMalayalam-Bold.ttf'),
  };
```

In `render()`, register both fonts right after the document is constructed — before `build(doc)` runs:

```typescript
        const doc = new PDFDocument(options);
        doc.registerFont('NotoML', this.fonts.regular);
        doc.registerFont('NotoML-Bold', this.fonts.bold);
```

Then replace every font reference in the file:

```bash
sed -i '' "s/doc\.font('Helvetica-Bold')/doc.font('NotoML-Bold')/g; s/doc\.font('Helvetica')/doc.font('NotoML')/g" src/core/order/invoice.service.ts
grep -c "Helvetica" src/core/order/invoice.service.ts
```

Expected from `grep -c`: `1` — only the stale comment on line 15-16 mentioning Helvetica remains. Leave it for now; Task 3 removes it.

- [ ] **Step 4: Run the tests — the embedding test now passes, the crash test now fails**

```bash
npx jest invoice-malayalam
```

Expected: `embeds a Malayalam-capable font` PASSES. `does not crash shaping conjunct-heavy Malayalam` now FAILS with `TypeError: Cannot read properties of null (reading 'xCoordinate')`.

This is the real red state for the crash. Do not commit here.

- [ ] **Step 5: Add the `harden()` choke point**

Add this constant just above the `@Injectable()` decorator:

```typescript
/**
 * fontkit@2.0.4 (latest published; no upgrade available) dereferences a null anchor
 * while applying the `abvm` above-base-mark feature to Malayalam conjuncts, throwing
 * "Cannot read properties of null (reading 'xCoordinate')". Disabling only `abvm`
 * avoids it with no visual change — verified glyph-for-glyph against a HarfBuzz
 * rendering. Disabling blwm/mark/mkmk/dist/kern does not help.
 */
const ABVM_OFF = { abvm: false } as const;
```

Add this private method to the class, next to the other helpers:

```typescript
  /**
   * Forces ABVM_OFF onto every text call. A single un-hardened call site would be a
   * production crash, so this wraps the document once rather than trusting 28 call
   * sites. Spread order lets an explicit caller-supplied `features` win.
   */
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

Then apply it in `render()`, immediately after the two `registerFont` calls:

```typescript
        this.harden(doc);
```

- [ ] **Step 6: Run the tests and confirm all pass**

```bash
npx jest invoice-malayalam
```

Expected: all 4 tests PASS.

- [ ] **Step 7: Confirm nothing else regressed**

```bash
npm test
```

Expected: the full suite passes, including the 5 pre-existing spec files.

- [ ] **Step 8: Eyeball the actual output**

```bash
npm run build
node -e "
const {InvoiceService}=require('./dist/core/order/invoice.service');
const fs=require('fs');
const o={id:'o1',createdAt:new Date(),status:'CONFIRMED',paymentMethod:'COD',totalAmount:250,
  user:{name:'Test'},deliveryDetails:{name:'Test',address:'Kochi',pinCode:'682001'},
  orderItems:[{quantity:2,price:125,totalPrice:250,product:{name:'വെണ്ടയ്ക്ക'},variant:{weight:500}},
              {quantity:1,price:45,totalPrice:45,product:{name:'Spinach / ചീര'},variant:{weight:250}}]};
new InvoiceService().generateBill(o).then(b=>{fs.writeFileSync('/tmp/bill.pdf',b);console.log('wrote /tmp/bill.pdf')});
"
open /tmp/bill.pdf
```

Confirm the Malayalam renders as joined conjuncts, not boxes or disconnected pieces. Compare `വെണ്ടയ്ക്ക` against this plan's own text — the `ണ്ട` and `ക്ക` must each appear as one joined shape.

- [ ] **Step 9: Commit**

```bash
git add src/core/order/invoice.service.ts src/core/order/invoice-malayalam.spec.ts
git commit -m "fix: render Malayalam product names in invoice PDFs

Replaces Helvetica with Noto Sans Malayalam across bill and label. Disables
the abvm OpenType feature on every text call via a single wrapper, working
around a fontkit 2.0.4 crash on Malayalam conjuncts."
```

---

### Task 3: Print ₹ instead of "Rs." (optional)

Noto Sans Malayalam covers U+20B9, so the `Rs.` fallback is no longer necessary. This task is independent and revertable on its own — **skip it entirely if the printed bills should keep reading `Rs.`**

**Files:**
- Modify: `src/core/order/invoice.service.ts`
- Test: `src/core/order/invoice-malayalam.spec.ts`

**Interfaces:**
- Consumes: the registered `NotoML` font from Task 2.
- Produces: `money()` returns `"₹ 250.00"` instead of `"Rs. 250.00"`.

- [ ] **Step 1: Write the failing test**

Append inside the existing `describe` block in `src/core/order/invoice-malayalam.spec.ts`:

```typescript
  it('prints amounts with the rupee sign', async () => {
    const buf = await service.generateBill(order('തക്കാളി'));
    expect(buf.subarray(0, 4).toString()).toBe('%PDF');
    expect((service as any).money(250)).toBe('₹ 250.00');
  });
```

- [ ] **Step 2: Run it and confirm it fails**

```bash
npx jest invoice-malayalam -t 'rupee sign'
```

Expected: FAIL — received `"Rs. 250.00"`.

- [ ] **Step 3: Update `money()` and drop the stale comment**

Change the `money` helper to:

```typescript
  private money(n: number): string {
    return `₹ ${(Number(n) || 0).toFixed(2)}`;
  }
```

Then delete these two now-false lines from the class doc comment at the top of the file:

```
 * Amounts are rendered as "Rs." rather than the ₹ glyph: pdfkit's built-in
 * Helvetica font has no rupee glyph, so ₹ would print as a blank box.
```

- [ ] **Step 4: Run the tests**

```bash
npx jest invoice-malayalam && npm test
```

Expected: all PASS.

- [ ] **Step 5: Verify no Helvetica references remain**

```bash
grep -c "Helvetica" src/core/order/invoice.service.ts
```

Expected: `0`.

- [ ] **Step 6: Commit**

```bash
git add src/core/order/invoice.service.ts src/core/order/invoice-malayalam.spec.ts
git commit -m "feat: print rupee sign in invoice PDFs now that the font supports it"
```

---

## Verification Checklist

- [ ] `npm test` passes in full.
- [ ] `npm run build && ls dist/assets/fonts/` shows both `.ttf` files.
- [ ] A generated bill shows Malayalam conjuncts joined correctly, not boxes.
- [ ] The 80mm label renders Malayalam in its `ITEM:` continued-text chain.
- [ ] An all-English order still renders correctly.
- [ ] `src/assets/fonts/OFL.txt` is committed alongside the fonts.
