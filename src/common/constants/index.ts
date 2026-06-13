/**
 * Master list of cutting styles a product variant can offer.
 * Admins pick a subset of these per variant and set a price for each.
 * Kept in sync with frontend/app/constants.ts (separate package).
 */
export const CUTTING_STYLES = ['Curry', 'Steak', 'Fillet', 'Whole'] as const;

export type CuttingStyle = (typeof CUTTING_STYLES)[number];
