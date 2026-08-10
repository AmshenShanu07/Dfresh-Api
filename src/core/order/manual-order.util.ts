import { ShareCatalogStatus } from 'src/common/enums';

/** One line as the admin form submits it: choices, not prices. */
export type ManualOrderItemInput = {
  variantId: string;
  quantity: number;
  /** Unit price — prefilled from the catalog client-side, but editable. */
  price: number;
  cleaning?: boolean;
  /** CuttingStyle master id, matching OrderItems.cuttingOption. */
  cuttingStyleId?: string | null;
};

/** One line with every charge resolved, ready to become an OrderItems row. */
export type ResolvedManualLine = {
  variantId: string;
  productId: string;
  quantity: number;
  price: number;
  cleaning: boolean;
  cleaningCharge: number;
  cutting: boolean;
  cuttingOption: string | null;
  cuttingCharge: number;
  totalPrice: number;
};

/**
 * Resolves a submitted line against its variant.
 *
 * Cleaning and cutting charges are read from the variant rather than trusted
 * from the request, so a hand-edited payload cannot zero them out. The unit
 * price *is* taken from the request — that one is deliberately staff-editable,
 * since manual orders cover off-catalog items and agreed prices.
 *
 * A cutting style that the variant does not offer, or that has been
 * soft-deleted, resolves to no cutting at all rather than a free upgrade. This
 * mirrors WhatsappService.getCuttingPrice.
 */
export function resolveManualLine(
  variant: any,
  input: ManualOrderItemInput,
): ResolvedManualLine {
  const quantity = Number(input.quantity);
  const price = Number(input.price);

  const cleaning = input.cleaning === true;
  const cleaningCharge = cleaning ? Number(variant?.cleaningCharge ?? 0) : 0;

  const style = input.cuttingStyleId
    ? (variant?.cuttingStyles ?? []).find(
        (s: any) => !s.isDeleted && s.cuttingStyleId === input.cuttingStyleId,
      )
    : null;
  const cutting = !!style;
  const cuttingCharge = cutting ? Number(style.price ?? 0) : 0;

  return {
    variantId: variant.id,
    productId: variant.productId,
    quantity,
    price,
    cleaning,
    cleaningCharge,
    cutting,
    cuttingOption: cutting ? input.cuttingStyleId : null,
    cuttingCharge,
    totalPrice: (price + cleaningCharge + cuttingCharge) * quantity,
  };
}

/**
 * Order total — the same arithmetic OrderService.createOrder applies to a
 * WhatsApp cart, so a manual order's bill adds up identically.
 */
export function manualOrderTotal(lines: ResolvedManualLine[]): number {
  return lines.reduce((sum, line) => sum + line.totalPrice, 0);
}

/**
 * Chooses the price to prefill for a variant from every ShareCatalogProducts
 * row that carries it (each with `shareCatalog` loaded).
 *
 * The LIVE catalog wins outright — that is what a customer would be quoted
 * right now. Otherwise the most recently created catalog wins, which is the
 * closest thing to a current price when nothing is live. Deleted catalogs are
 * ignored. Returns null when nothing applies, leaving the form's price box
 * blank for staff to fill in.
 */
export function pickCatalogPrice(entries: any[]): number | null {
  const usable = (entries ?? []).filter(
    (e) => e?.shareCatalog && !e.shareCatalog.isDeleted,
  );
  if (usable.length === 0) return null;

  const live = usable.find(
    (e) => e.shareCatalog.status === ShareCatalogStatus.LIVE,
  );
  if (live) return Number(live.price);

  const newest = usable.reduce((best, e) =>
    new Date(e.shareCatalog.createdAt) > new Date(best.shareCatalog.createdAt)
      ? e
      : best,
  );
  return Number(newest.price);
}
