/**
 * WhatsApp caps several interactive fields by character count. A message that
 * exceeds them is rejected by Meta outright — the customer sees nothing — so
 * MessagesService checks these at startup and logs a warning for any key that
 * is already too long.
 *
 * Only the *raw template* is measured. A key containing placeholders can still
 * overflow once the values are substituted; the guide (messages/README.md)
 * calls this out.
 */

/** Field kinds, with the limit Meta enforces for each. */
export const FIELD_LIMITS = {
  /** Reply-button title inside an interactive button message. */
  buttonTitle: 20,
  /** The button that opens an interactive list, and Flow CTAs. */
  actionButton: 20,
  /** A row title inside a list. */
  rowTitle: 24,
  /** A row's grey subtitle inside a list. */
  rowDescription: 72,
  /** A list section heading. */
  sectionTitle: 24,
  /** The bold header line of an interactive message. */
  header: 60,
  /** The small print under an interactive message. */
  footer: 60,
  /** Main message body, and image/document captions. */
  body: 1024,
} as const;

export type FieldKind = keyof typeof FIELD_LIMITS;

/** Dotted message key → the WhatsApp field it is rendered into. */
export const MESSAGE_LIMITS: Record<string, FieldKind> = {
  'common.footer': 'footer',
  'common.productListFooter': 'footer',
  'common.buttonYes': 'buttonTitle',
  'common.buttonNo': 'buttonTitle',

  'onboarding.namePrompt': 'body',
  'onboarding.nameReprompt': 'body',
  'onboarding.welcome': 'body',
  'onboarding.mainMenu': 'body',
  'onboarding.buttonViewProducts': 'buttonTitle',
  'onboarding.buttonViewCart': 'buttonTitle',

  'category.listHeader': 'header',
  'category.listBody': 'body',
  'category.listButton': 'actionButton',
  'category.listSection': 'sectionTitle',
  'category.listMore': 'rowTitle',
  'category.rowCountOne': 'rowDescription',
  'category.rowCount': 'rowDescription',
  'category.backRow': 'rowTitle',
  'category.soldOut': 'body',

  'catalog.broadcast': 'body',
  'catalog.listHeader': 'header',
  'catalog.listBody': 'body',
  'catalog.listButton': 'actionButton',
  'catalog.listSectionFallback': 'sectionTitle',
  'catalog.listMore': 'rowTitle',
  'catalog.subtitle': 'rowDescription',

  'variant.unavailable': 'body',
  'variant.listBodyWeight': 'body',
  'variant.listBodyVolume': 'body',
  'variant.listBodyCount': 'body',
  'variant.listButtonWeight': 'actionButton',
  'variant.listButtonVolume': 'actionButton',
  'variant.listButtonCount': 'actionButton',
  'variant.listSectionWeight': 'sectionTitle',
  'variant.listSectionVolume': 'sectionTitle',
  'variant.listSectionCount': 'sectionTitle',
  'variant.rowPrice': 'rowDescription',

  'prep.unavailable': 'body',
  'prep.cleaningQuestion': 'body',
  'prep.cuttingQuestion': 'body',
  'prep.cuttingListBody': 'body',
  'prep.cuttingListButton': 'actionButton',
  'prep.cuttingListSection': 'sectionTitle',
  'prep.cuttingRowPrice': 'rowDescription',
  'prep.cuttingRowFree': 'rowDescription',

  'item.summary': 'body',
  'item.buttonAddToCart': 'buttonTitle',
  'item.buttonCancel': 'buttonTitle',
  'item.cancelled': 'body',

  'cart.summary': 'body',
  'cart.empty': 'body',
  'cart.addFailed': 'body',
  'cart.buttonAddMore': 'buttonTitle',
  'cart.buttonRemove': 'buttonTitle',
  'cart.buttonBuyNow': 'buttonTitle',
  'cart.removeListHeader': 'header',
  'cart.removeListBody': 'body',
  'cart.removeListButton': 'actionButton',
  'cart.removeListSection': 'sectionTitle',
  'cart.removeRowPrice': 'rowDescription',
  'cart.itemRemoved': 'body',

  'address.wardListHeader': 'header',
  'address.wardListBody': 'body',
  'address.wardListButton': 'actionButton',
  'address.wardListSection': 'sectionTitle',
  'address.wardListMore': 'rowTitle',
  'address.wardRowDescription': 'rowDescription',
  'address.areaListHeader': 'header',
  'address.areaListBody': 'body',
  'address.areaListButton': 'actionButton',
  'address.areaListSection': 'sectionTitle',
  'address.areaListMore': 'rowTitle',
  'address.flowPrompt': 'body',
  'address.flowButton': 'actionButton',
  'address.confirm': 'body',
  'address.buttonConfirm': 'buttonTitle',
  'address.buttonAddNew': 'buttonTitle',

  'payment.prompt': 'body',
  'payment.buttonCod': 'buttonTitle',
  'payment.buttonUpi': 'buttonTitle',
  'payment.codConfirmed': 'body',
  'payment.upiQrCaption': 'body',
  'payment.lockedConfirmed': 'body',
  'payment.lockedCancelled': 'body',
  'payment.screenshotReceived': 'body',
  'payment.screenshotNoOrder': 'body',

  'order.placed': 'body',
  'order.statusUpdate': 'body',
  'order.billCaption': 'body',

  'availability.outOfStock': 'body',
  'availability.offHoursWithNext': 'body',
  'availability.offHours': 'body',
};
