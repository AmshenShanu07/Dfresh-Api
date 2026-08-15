/**
 * Built-in copy for every customer-facing WhatsApp text.
 *
 * This object is the single source of truth for the *key set*. The text itself
 * is meant to be edited in `src/messages/{en,ml}.json` (see
 * `src/messages/README.md`); these defaults are the safety net — they are used
 * when the JSON file is missing a key, and to seed the file on first boot.
 *
 * `{{placeholder}}` tokens are filled in by MessagesService.get(). Every token
 * a key supports is documented in `src/messages/README.md`.
 */

export type MessageTree = { [key: string]: string | MessageTree };

export const MESSAGE_DEFAULTS: MessageTree = {
  common: {
    // Small print under most interactive messages.
    footer: 'Fresh to home™',
    // The product list carries a different footer today.
    productListFooter: 'Daily Fresh™',
    // Shown where a value would otherwise be blank (e.g. no prep options).
    none: '—',
    // Joins the prep options in a product list subtitle.
    separator: ' · ',
    buttonYes: 'Yes',
    buttonNo: 'No',
    // Stand-ins for a product/cart row whose product record has no name.
    fallbackProduct: 'Product',
    fallbackItem: 'Item',
  },

  language: {
    // Shown before we know which language the customer reads, so this prompt and
    // the two button titles must stay identical in every language file.
    prompt: 'Please choose your language\nദയവായി നിങ്ങളുടെ ഭാഷ തിരഞ്ഞെടുക്കുക',
    buttonEnglish: 'English',
    buttonMalayalam: 'മലയാളം',
    // Sent after a change from the main menu, already in the newly chosen language.
    changed: 'Language updated.',
  },

  onboarding: {
    namePrompt: 'Hi! Welcome to Daily Fresh. Please reply with your name to get started.',
    nameReprompt: 'Please share your name first to continue. Reply with your name.',
    welcome:
      'Hey {{name}}!\nWelcome to Daily Fresh! \nPlease checkout our catlog for the best deals!',
    mainMenu: 'Hi {{name}}! What would you like to do?',
    buttonViewProducts: 'View Products',
    buttonViewCart: 'View Cart',
    buttonLanguage: 'Change Language',
  },

  category: {
    listHeader: 'Shop by Category',
    listBody: "Tap a category to see what's fresh right now.",
    listButton: 'View Categories',
    listSection: 'Categories',
    listMore: 'More categories',
    // Grey subtitle under a category row. Two forms so the singular reads well.
    rowCountOne: '{{count}} item available',
    rowCount: '{{count}} items available',
    // Row that takes the customer back from the product list to the categories.
    backRow: '⬅️ Back to categories',
    // The tapped category emptied out before the customer chose a product.
    soldOut: 'Sorry, that category just sold out.',
  },

  catalog: {
    // Broadcast sent to every customer when a share catalog window opens.
    broadcast:
      'Hey! Our fresh catalog is live now 🥬\nTap below to browse and place your order.',
    listHeader: 'Our Products',
    listBody: 'Tap a product to see available weights and place your order.',
    listButton: 'View Products',
    // Section heading of the product list — the category name is used when the
    // product has one; this is the fallback.
    listSectionFallback: 'Products',
    listMore: 'More products',
    // Grey subtitle under a product row: "₹120/kg · 🧼 Cleaning · 🔪 Cutting".
    subtitle: '{{price}}{{separator}}{{options}}',
    subtitlePriceUnit: '₹{{price}}{{unitSuffix}}',
    subtitlePriceFlat: '₹{{price}}',
    unitSuffixWeight: '/kg',
    unitSuffixVolume: '/L',
    unitSuffixCount: '/piece',
    optionCleaning: '🧼 Cleaning',
    optionCutting: '🔪 Cutting',
  },

  variant: {
    // Shown when the tapped product has since sold out / been removed.
    unavailable: 'Sorry, that product is no longer available.',
    listBodyWeight: 'Choose a weight.',
    listBodyVolume: 'Choose a size.',
    listBodyCount: 'Choose a pack.',
    listButtonWeight: 'Select Weight',
    listButtonVolume: 'Select Size',
    listButtonCount: 'Select Pack',
    listSectionWeight: 'Available Weights',
    listSectionVolume: 'Available Sizes',
    listSectionCount: 'Available Packs',
    // Price shown beside each weight/size/pack row.
    rowPrice: '₹{{price}}',
  },

  prep: {
    // Shown when the tapped variant is no longer sellable.
    unavailable: 'Sorry, that item is no longer available.',
    cleaningQuestion: 'Would you like this item cleaned?{{chargeSuffix}}',
    cleaningChargeSuffix: ' (+₹{{charge}})',
    cuttingQuestion: 'Would you like this item cut?',
    cuttingListBody: 'How would you like it cut?',
    cuttingListButton: 'Choose Cut',
    cuttingListSection: 'Cutting Options',
    cuttingRowPrice: '+₹{{price}}',
    cuttingRowFree: 'Free',
  },

  item: {
    summary: '🧾 *Order Summary*\n\n{{lines}}\n\n*Total: ₹{{total}}*',
    lineProduct: '{{product}} — {{weight}}',
    lineBasePrice: 'Base price: ₹{{price}}',
    lineCleaning: 'Cleaning: +₹{{charge}}',
    lineCutting: 'Cutting: +₹{{charge}}',
    lineCuttingWithStyle: 'Cutting ({{style}}): +₹{{charge}}',
    buttonAddToCart: 'Add to Cart',
    buttonCancel: 'Cancel',
    cancelled: 'No problem — here are the products again.',
  },

  cart: {
    summary:
      '🛒 *Your Cart*\n\n{{lines}}\n\nTotal items: {{totalQuantity}}\n*Total: ₹{{grandTotal}}*',
    line: '• {{label}} — ₹{{lineTotal}}',
    // One cart line's label, assembled from the parts below.
    label: '{{product}}{{weightPart}}{{addOnPart}}{{quantityPart}}',
    labelWeightPart: ' — {{weight}}',
    labelAddOnPart: ' ({{addOns}})',
    labelQuantityPart: ' x{{quantity}}',
    labelAddOnSeparator: ', ',
    addOnCleaned: 'Cleaned',
    addOnCut: 'Cut',
    addOnCutWithStyle: 'Cut: {{style}}',
    empty: 'Your cart is empty. Here are the products again.',
    addFailed: 'Could not add the item to your cart. Please try again.',
    buttonAddMore: 'Add more',
    buttonRemove: 'Remove item',
    buttonBuyNow: 'Buy it now',
    removeListHeader: 'Remove an item',
    removeListBody: 'Select an item to remove from your cart.',
    removeListButton: 'Remove',
    removeListSection: 'Cart Items',
    removeRowPrice: '₹{{lineTotal}}',
    itemRemoved: 'Item removed from your cart.',
  },

  address: {
    wardListHeader: 'Select your ward',
    wardListBody: 'Choose the ward your delivery address falls under.',
    wardListButton: 'Select Ward',
    wardListSection: 'Active Wards',
    wardListMore: 'More wards',
    wardRowNamed: '{{wardName}} ({{wardNumber}})',
    wardRowUnnamed: 'Ward {{wardNumber}}',
    wardRowDescription: '{{localBodyName}}, {{districtName}}',
    areaListHeader: 'Select your area',
    areaListBody: 'Choose the area your delivery address falls under.',
    areaListButton: 'Select Area',
    areaListSection: 'Areas',
    areaListMore: 'More areas',
    flowPrompt: 'Please share your delivery address',
    flowButton: 'Enter Address',
    confirm:
      'Please verify your delivery address:\n\n' +
      'Name: {{name}}\n' +
      'Address: {{address}}\n' +
      'Landmark: {{landmark}}\n' +
      'Pincode: {{pincode}}\n' +
      'Phone: {{phone}}\n\n' +
      'Is this correct?',
    buttonConfirm: 'Confirm Address',
    buttonAddNew: 'Add New Address',
  },

  payment: {
    prompt:
      'Your order is ready!\n\n' +
      '*Total: ₹{{amount}}*\n\n' +
      'Choose your payment method:',
    buttonCod: 'Cash on Delivery',
    buttonUpi: 'UPI Payment',
    codConfirmed:
      '✅ *Order Confirmed!*\n\n' +
      'Payment Method: *Cash on Delivery*\n' +
      'Please pay *₹{{amount}}* in cash when your order arrives.\n\n' +
      '📍 *Delivery Address:*\n{{address}}\n\n' +
      '_Further order updates will be notified to you on WhatsApp._',
    upiQrCaption:
      'Scan this QR to pay *₹{{amount}}*.\n\n' +
      'After paying, *reply with the payment screenshot* in this chat to confirm your order.',
    // Tapping a payment button on an order that has moved on.
    lockedConfirmed:
      "✅ Your order is already confirmed and can't be changed.\n\n" +
      'If you need any help, please contact support.',
    lockedCancelled:
      "This order is no longer active and can't be changed.\n\n" +
      'Please place a new order to continue.',
    lockedAwaitingScreenshot:
      "You've already selected UPI as your payment method. Please upload your payment screenshot to confirm the order.\n\n" +
      'If you need any help, please contact support.',
    screenshotReceived:
      '✅ Thanks! Your payment screenshot has been received.\n\n' +
      "We'll verify the payment and confirm your order shortly.",
    screenshotNoOrder:
      "We couldn't find a pending UPI payment for your number.\n" +
      "If you've just paid, please place your order again or contact support.",
  },

  order: {
    placed:
      '✅ *Order Placed Successfully!*\n\n' +
      '📦 *Your Order:*\n{{lines}}\n\n' +
      '*Total Amount: ₹{{totalAmount}}*\n\n' +
      '📍 *Delivery Address:*\n{{address}}\n\n' +
      '_Further order updates will be notified to you on WhatsApp._',
    line: '• {{product}} - {{quantity}}{{addOnPart}} - ₹{{lineTotal}}',
    lineQuantityWithUnit: '{{quantity}} × {{unit}}',
    lineQuantity: '{{quantity}}',
    lineAddOnPart: ' ({{addOns}})',
    lineAddOnSeparator: ', ',
    addOnCleaning: 'Cleaning +₹{{charge}}',
    addOnCutting: 'Cutting +₹{{charge}}',
    addOnCuttingWithStyle: 'Cut {{style}} +₹{{charge}}',
    addressBlock: '{{name}}\n{{address}}\nPhone: {{phone}}',
    addressMissing: 'Address not available',
    statusUpdate:
      '{{headline}}\n\n' +
      'Order *#{{orderNumber}}*\n' +
      '*Total Amount: ₹{{totalAmount}}*\n' +
      '{{agentBlock}}' +
      '\n_Further order updates will be notified to you on WhatsApp._',
    statusConfirmedHeadline: '✅ *Your order has been confirmed!*',
    statusDispatchedHeadline: '🚚 *Your order is out for delivery!*',
    agentBlock: '\n*Delivery partner:* {{agentName}}{{agentContact}}\n',
    agentContact: '\n*Contact:* {{agentPhone}}',
    billCaption: '🧾 Your Daily Fresh bill for order {{orderNumber}}.',
  },

  availability: {
    outOfStock:
      'All products are currently out of stock. Please try again after some time.',
    offHoursWithNext:
      "We're not in active hours right now.\n" +
      'Our next active window opens on {{nextWindow}} IST.\n' +
      'Please message us then.',
    offHours: "We're not in active hours right now. Please check back later.",
  },
};
