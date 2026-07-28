# Editing the WhatsApp messages

Every message the D-Fresh bot sends to a customer lives in **`messages.json`**, next to this file.
Change the text there and the bot uses it immediately — no rebuild, no restart, no deploy.

The text can be in any language. Write the whole file in Malayalam if you want; only the **keys**
(the words on the left of the `:`) have to stay in English.

---

## How to edit

1. Open `messages.json`.
2. Find the key you want (use the tables below to know which one shows where).
3. Change **only the text inside the quotes** on the right of the `:`.
4. Save. The next message the bot sends uses your new text.

```jsonc
"onboarding": {
  "welcome": "Hey {{name}}!\nWelcome to Dfresh!"
//  ↑ key — don't change   ↑ text — change this
}
```

### It is safe to experiment

- **Broken JSON** (a missing quote, comma or bracket) is ignored — the bot keeps using the last
  version that worked and writes the error to the server log. Fix the file and save again.
- **A deleted key** falls back to the built-in English text. Nothing breaks.
- **A key you invent** is never used. The startup log lists unknown keys so typos are easy to spot.

---

## Rules that actually matter

**Use `\n` for a new line.** A real line break inside the quotes is invalid JSON.

```json
"welcome": "Hello!\nWelcome to D-Fresh."
```

**Escape double quotes** inside the text as `\"`, or just use single quotes:

```json
"listBody": "Tap a product to see what's fresh."
```

**WhatsApp formatting** works in message bodies:

| You write | Customer sees |
|---|---|
| `*bold*` | **bold** |
| `_italic_` | _italic_ |
| `~strike~` | ~~strike~~ |

Emoji can be pasted straight in: `"🛒 *Your Cart*"`.

### `{{placeholders}}`

`{{name}}`, `{{grandTotal}}` and so on are filled in by the app when the message is sent.

- You may **move** a placeholder anywhere in the text, or **remove** it.
- You may **not invent** one. A placeholder that isn't in the key's list below renders as
  **nothing at all** — `{{userName}}` in a key that only offers `{{name}}` disappears silently.
- Placeholders never carry the `₹` symbol or units. Those are part of the text, so you can change
  `₹{{price}}` to `{{price}} rupees`.

### Length limits

WhatsApp rejects a message whose button or list text is too long — the customer then gets nothing
at all. Keep these under:

| Where | Limit |
|---|---|
| Reply button titles (`button…`, `buttonYes`, …) | 20 characters |
| List open button (`listButton`, `flowButton`, `removeListButton`) | 20 characters |
| List row titles (`listMore`, `backRow`) | 24 characters |
| List row subtitles (`rowPrice`, `rowCount`, `subtitle`, …) | 72 characters |
| List headers (`listHeader`, `removeListHeader`) | 60 characters |
| Footers (`footer`, `productListFooter`) | 60 characters |
| Message bodies, captions | 1024 characters |

The app checks these when it starts and warns in the log about any key that is already too long.
It measures the text as written — remember that `{{placeholders}}` grow when filled in, so leave
some room.

---

## The keys

### `common` — used across many messages

| Key | Where it shows | Placeholders |
|---|---|---|
| `footer` | Small grey line under most messages | — |
| `productListFooter` | Same, but on the product list only | — |
| `none` | Stands in for "no options" in a product subtitle | — |
| `separator` | Joins the prep options in a product subtitle | — |
| `buttonYes` / `buttonNo` | The Yes/No buttons on the cleaning and cutting questions | — |
| `fallbackProduct` / `fallbackItem` | Used when a product record has no name | — |

### `onboarding` — first contact and the main menu

| Key | Where it shows | Placeholders |
|---|---|---|
| `namePrompt` | Sent to a brand-new number, asking for a name | — |
| `nameReprompt` | Sent when they replied with something other than a name | — |
| `welcome` | Reply to "hi" / "hello" / "menu" | `{{name}}` — the customer's name |
| `mainMenu` | Reply to any other text from a known customer | `{{name}}` |
| `buttonViewProducts` | Button that opens the catalog | — |
| `buttonViewCart` | Button that opens the cart (only shown when the cart has items) | — |

### `category` — the first browsing screen

| Key | Where it shows | Placeholders |
|---|---|---|
| `listHeader` | Bold header of the category list | — |
| `listBody` | Text above the category rows | — |
| `listButton` | Button that opens the list | — |
| `listSection` | Heading above the rows | — |
| `listMore` | Last row when there are more than 10 categories | — |
| `rowCountOne` | Subtitle of a category with exactly one product | `{{count}}` — always 1 |
| `rowCount` | Subtitle of a category with 2+ products | `{{count}}` — number of products |
| `backRow` | Row on the product list that goes back to categories | — |
| `soldOut` | Sent when the tapped category sold out in the meantime | — |

> The category step is skipped automatically when only one category has stock.

### `catalog` — the broadcast and the product list

| Key | Where it shows | Placeholders |
|---|---|---|
| `broadcast` | Sent to every customer when a catalog window opens | — |
| `listHeader` | Bold header of the product list | — |
| `listBody` | Text above the product rows | — |
| `listButton` | Button that opens the list | — |
| `listSectionFallback` | Section heading when the products have no category | — |
| `listMore` | Last row when a category has more products than fit | — |
| `subtitle` | The grey line under a product name | `{{price}}`, `{{separator}}`, `{{options}}` |
| `subtitlePriceUnit` | The price part of that line | `{{price}}`, `{{unitSuffix}}` |
| `subtitlePriceFlat` | Price part when no per-unit price can be worked out | `{{price}}` |
| `unitSuffixWeight` / `unitSuffixVolume` / `unitSuffixCount` | `/kg`, `/L`, `/piece` | — |
| `optionCleaning` / `optionCutting` | The 🧼 / 🔪 tags in that line | — |

### `variant` — choosing a weight, size or pack

Each measurement family has its own wording so the sentence reads naturally in any language:
**Weight** (g/kg), **Volume** (ml/L), **Count** (pieces).

| Key | Where it shows | Placeholders |
|---|---|---|
| `unavailable` | The tapped product is gone | — |
| `listBodyWeight` / `listBodyVolume` / `listBodyCount` | Text above the options | — |
| `listButtonWeight` / `listButtonVolume` / `listButtonCount` | Button that opens the list | — |
| `listSectionWeight` / `listSectionVolume` / `listSectionCount` | Heading above the rows | — |
| `rowPrice` | Price under each option | `{{price}}` |

> The bold header of this list is the product's own name, from the database.

### `prep` — cleaning and cutting

| Key | Where it shows | Placeholders |
|---|---|---|
| `unavailable` | The chosen item is gone | — |
| `cleaningQuestion` | "Would you like this item cleaned?" | `{{chargeSuffix}}` — the bit below, empty when cleaning is free |
| `cleaningChargeSuffix` | Appended to the question when there is a charge | `{{charge}}` — cleaning charge in rupees |
| `cuttingQuestion` | "Would you like this item cut?" | — |
| `cuttingListBody` | Text above the cutting styles | — |
| `cuttingListButton` | Button that opens the styles | — |
| `cuttingListSection` | Heading above the styles | — |
| `cuttingRowPrice` | Price under a paid style | `{{price}}` |
| `cuttingRowFree` | Shown instead when a style costs nothing | — |

### `item` — the per-item summary before adding to cart

| Key | Where it shows | Placeholders |
|---|---|---|
| `summary` | The whole message | `{{lines}}` — the lines below joined together, `{{total}}` |
| `lineProduct` | First line | `{{product}}`, `{{weight}}` |
| `lineBasePrice` | Second line | `{{price}}` |
| `lineCleaning` | Only when cleaning was chosen | `{{charge}}` |
| `lineCutting` | Only when cutting was chosen without a named style | `{{charge}}` |
| `lineCuttingWithStyle` | Only when a named cutting style was chosen | `{{style}}`, `{{charge}}` |
| `buttonAddToCart` / `buttonCancel` | The two buttons | — |
| `cancelled` | Sent when they tap Cancel | — |

### `cart`

| Key | Where it shows | Placeholders |
|---|---|---|
| `summary` | The cart message | `{{lines}}`, `{{totalQuantity}}`, `{{grandTotal}}` |
| `line` | One row of the cart | `{{label}}` — built from the keys below, `{{lineTotal}}` |
| `label` | How one cart row is described | `{{product}}`, `{{weightPart}}`, `{{addOnPart}}`, `{{quantityPart}}` |
| `labelWeightPart` | The weight bit of that label | `{{weight}}` |
| `labelAddOnPart` | The brackets around cleaning/cutting | `{{addOns}}` |
| `labelQuantityPart` | Only shown when quantity is 2 or more | `{{quantity}}` |
| `labelAddOnSeparator` | Between two add-ons | — |
| `addOnCleaned` | Shown when the item is cleaned | — |
| `addOnCut` | Shown when cut without a named style | — |
| `addOnCutWithStyle` | Shown when cut with a named style | `{{style}}` |
| `empty` | Sent when the cart is empty | — |
| `addFailed` | Sent when adding to the cart failed | — |
| `buttonAddMore` / `buttonRemove` / `buttonBuyNow` | The three cart buttons | — |
| `removeListHeader` / `removeListBody` / `removeListButton` / `removeListSection` | The "remove an item" list | — |
| `removeRowPrice` | Price under each removable row | `{{lineTotal}}` |
| `itemRemoved` | Confirmation after removing | — |

### `address`

| Key | Where it shows | Placeholders |
|---|---|---|
| `wardListHeader` / `wardListBody` / `wardListButton` / `wardListSection` | The ward picker | — |
| `wardListMore` | Last row when there are more than 10 wards | — |
| `wardRowNamed` | A ward row that has a name | `{{wardName}}`, `{{wardNumber}}` |
| `wardRowUnnamed` | A ward row with only a number | `{{wardNumber}}` |
| `wardRowDescription` | Grey line under a ward | `{{localBodyName}}`, `{{districtName}}` |
| `flowPrompt` | Text above the address form | — |
| `flowButton` | Button that opens the form | — |
| `confirm` | Asking a returning customer to confirm their saved address | `{{name}}`, `{{address}}`, `{{pinCode}}`, `{{phone}}` |
| `buttonConfirm` / `buttonAddNew` | The two buttons under it | — |

### `payment`

| Key | Where it shows | Placeholders |
|---|---|---|
| `prompt` | Asking how they want to pay | `{{amount}}` — order total, two decimals |
| `buttonCod` / `buttonUpi` | The two payment buttons | — |
| `codConfirmed` | Confirmation after choosing cash on delivery | `{{amount}}`, `{{address}}` |
| `upiQrCaption` | Caption under the UPI QR image | `{{amount}}` |
| `lockedConfirmed` | Tapping a payment button on an already-confirmed order | — |
| `lockedCancelled` | Tapping a payment button on a cancelled order | — |
| `screenshotReceived` | After they send the payment screenshot | — |
| `screenshotNoOrder` | A screenshot arrived with no payment waiting | — |

### `order`

| Key | Where it shows | Placeholders |
|---|---|---|
| `placed` | "Order placed successfully" | `{{lines}}`, `{{totalAmount}}`, `{{address}}` |
| `line` | One item of that order | `{{product}}`, `{{quantity}}`, `{{addOnPart}}`, `{{lineTotal}}` |
| `lineQuantityWithUnit` | The quantity bit when the item has a size | `{{quantity}}`, `{{unit}}` |
| `lineQuantity` | The quantity bit when it doesn't | `{{quantity}}` |
| `lineAddOnPart` | The brackets around cleaning/cutting | `{{addOns}}` |
| `lineAddOnSeparator` | Between two add-ons | — |
| `addOnCleaning` | The cleaning add-on | `{{charge}}` |
| `addOnCutting` | Cutting without a named style | `{{charge}}` |
| `addOnCuttingWithStyle` | Cutting with a named style | `{{style}}`, `{{charge}}` |
| `addressBlock` | The delivery address block | `{{name}}`, `{{address}}`, `{{pinCode}}`, `{{phone}}` |
| `addressMissing` | Shown instead when there is no address | — |
| `statusUpdate` | Sent when an admin confirms or dispatches | `{{headline}}`, `{{orderNumber}}`, `{{totalAmount}}`, `{{agentBlock}}` |
| `statusConfirmedHeadline` | The headline for a confirmed order | — |
| `statusDispatchedHeadline` | The headline for a dispatched order | — |
| `agentBlock` | Delivery partner details, dispatched orders only | `{{agentName}}`, `{{agentContact}}` |
| `agentContact` | The phone line inside that block | `{{agentPhone}}` |
| `billCaption` | Caption on the bill PDF | `{{orderNumber}}` |

### `availability`

| Key | Where it shows | Placeholders |
|---|---|---|
| `outOfStock` | Everything is sold out during an open window | — |
| `offHoursWithNext` | Outside opening hours, when the next window is known | `{{nextWindow}}` — e.g. `Tue, 5 Aug at 6:00 am` |
| `offHours` | Outside opening hours, no next window scheduled | — |

---

## For developers

- The file path can be overridden with the `MESSAGES_FILE` environment variable.
- `src/common/messages/messages.default.ts` holds the built-in copy and defines the valid key set.
  Adding a message means adding it there (and to `messages.limits.ts` if it goes into a
  length-limited field) — `messages.json` is then just an override layer.
- If `messages.json` is deleted, the app writes a fresh copy from the defaults on next start.
