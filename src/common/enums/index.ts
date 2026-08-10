export enum UserTypes {
  ADMIN = 'ADMIN',
  CUSTOMER = 'CUSTOMER',
  OUTLET_AGENT = 'OUTLET_AGENT',
  CENTRAL_STAFF = 'CENTRAL_STAFF',
  PURCHASE_STAFF = 'PURCHASE_STAFF',
  SUPPLIER = 'SUPPLIER',
}

/**
 * The language a customer chats in. Stored on `User` and used to pick which
 * message bundle (`src/messages/en.json` / `src/messages/ml.json`) replies come from.
 *
 * The column is nullable: NULL means the customer has never been asked, which
 * is what triggers the language prompt during onboarding. Reads fall back to
 * EN, so an unanswered customer still gets a reply.
 */
export enum UserLanguage {
  EN = 'en',
  ML = 'ml',
}

export enum ProductUnits {
  KG = 'KG',
  G = 'G',
  L = 'L',
  ML = 'ML',
  COUNT = 'COUNT',
}

/**
 * The measurement family a product is sold in. Chosen once per product; all its
 * variants and stock counters are locked to this family.
 *  - WEIGHT: base unit grams (g); display units g / kg
 *  - VOLUME: base unit millilitres (ml); display units ml / L
 *  - COUNT: base unit count; stored as-is, no conversion (e.g. eggs)
 */
export enum MeasurementType {
  WEIGHT = 'WEIGHT',
  VOLUME = 'VOLUME',
  COUNT = 'COUNT',
}

export enum ShareCatalogStatus {
  INACTIVE = 'INACTIVE',
  ACTIVE = 'ACTIVE',
  LIVE = 'LIVE',
  PAUSED = 'PAUSED',
}

/**
 * Statuses the cron/customer flow treats as "enabled", and therefore also the
 * only statuses that reserve a schedule slot and block an overlapping window.
 * INACTIVE and PAUSED catalogs are not selling, so they release their slot —
 * their schedule is re-validated when they are activated or resumed.
 *
 * Also the set that blocks deleting the underlying Catalog: a share catalog in
 * any other status is soft-deleted alongside it.
 */
export const ENABLED_STATUSES = [
  ShareCatalogStatus.ACTIVE,
  ShareCatalogStatus.LIVE,
];

export enum OrderStatus {
  DRAFT = 'DRAFT',
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  DISPATCHED = 'DISPATCHED',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED',
}

export enum PaymentMethod {
  COD = 'COD',
  UPI = 'UPI',
}

export enum PaymentStatus {
  NOT_REQUIRED = 'NOT_REQUIRED',
  AWAITING_SCREENSHOT = 'AWAITING_SCREENSHOT',
  AWAITING_VERIFICATION = 'AWAITING_VERIFICATION',
  VERIFIED = 'VERIFIED',
}

export enum ConstituencyType {
  GRAMA_PANCHAYAT = 'GRAMA_PANCHAYAT',
  BLOCK_PANCHAYAT = 'BLOCK_PANCHAYAT',
  DISTRICT_PANCHAYAT = 'DISTRICT_PANCHAYAT',
  MUNICIPALITY = 'MUNICIPALITY',
  MUNICIPAL_CORPORATION = 'MUNICIPAL_CORPORATION',
}
