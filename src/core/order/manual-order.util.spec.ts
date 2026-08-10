import {
  resolveManualLine,
  manualOrderTotal,
  pickCatalogPrice,
} from './manual-order.util';
import { ShareCatalogStatus } from 'src/common/enums';

/**
 * A variant as loaded with `relations: { cuttingStyles: { cuttingStyle: true } }`.
 * Charges must come from here — never from the request body — so staff cannot
 * zero out a cleaning charge by editing the payload.
 */
const variant = {
  id: 'variant-1',
  productId: 'product-1',
  cleaningCharge: 20,
  cuttingStyles: [
    { cuttingStyleId: 'style-curry', price: 15, isDeleted: false },
    { cuttingStyleId: 'style-fillet', price: 40, isDeleted: false },
    { cuttingStyleId: 'style-retired', price: 99, isDeleted: true },
  ],
};

describe('resolveManualLine', () => {
  it('charges nothing extra for a plain line', () => {
    const line = resolveManualLine(variant, {
      variantId: 'variant-1',
      quantity: 2,
      price: 100,
    });

    expect(line).toEqual({
      variantId: 'variant-1',
      productId: 'product-1',
      quantity: 2,
      price: 100,
      cleaning: false,
      cleaningCharge: 0,
      cutting: false,
      cuttingOption: null,
      cuttingCharge: 0,
      totalPrice: 200,
    });
  });

  it('takes the cleaning charge from the variant, not the request', () => {
    const line = resolveManualLine(variant, {
      variantId: 'variant-1',
      quantity: 2,
      price: 100,
      cleaning: true,
    });

    expect(line.cleaning).toBe(true);
    expect(line.cleaningCharge).toBe(20);
    expect(line.totalPrice).toBe(240); // (100 + 20) * 2
  });

  it('prices the chosen cutting style and records its master id', () => {
    const line = resolveManualLine(variant, {
      variantId: 'variant-1',
      quantity: 1,
      price: 100,
      cuttingStyleId: 'style-fillet',
    });

    expect(line.cutting).toBe(true);
    expect(line.cuttingOption).toBe('style-fillet');
    expect(line.cuttingCharge).toBe(40);
    expect(line.totalPrice).toBe(140);
  });

  it('combines cleaning and cutting on one line', () => {
    const line = resolveManualLine(variant, {
      variantId: 'variant-1',
      quantity: 3,
      price: 100,
      cleaning: true,
      cuttingStyleId: 'style-curry',
    });

    expect(line.totalPrice).toBe(405); // (100 + 20 + 15) * 3
  });

  it('ignores a soft-deleted cutting style', () => {
    const line = resolveManualLine(variant, {
      variantId: 'variant-1',
      quantity: 1,
      price: 100,
      cuttingStyleId: 'style-retired',
    });

    expect(line.cutting).toBe(false);
    expect(line.cuttingOption).toBeNull();
    expect(line.cuttingCharge).toBe(0);
  });

  it('ignores a cutting style the variant does not offer', () => {
    const line = resolveManualLine(variant, {
      variantId: 'variant-1',
      quantity: 1,
      price: 100,
      cuttingStyleId: 'style-from-another-product',
    });

    expect(line.cutting).toBe(false);
    expect(line.cuttingCharge).toBe(0);
  });

  it('charges nothing for cleaning a variant with no cleaning charge set', () => {
    const line = resolveManualLine(
      { id: 'v2', productId: 'p2', cleaningCharge: 0, cuttingStyles: [] },
      { variantId: 'v2', quantity: 1, price: 50, cleaning: true },
    );

    expect(line.cleaningCharge).toBe(0);
    expect(line.totalPrice).toBe(50);
  });
});

describe('manualOrderTotal', () => {
  it('sums the line totals', () => {
    const lines = [
      resolveManualLine(variant, {
        variantId: 'variant-1',
        quantity: 2,
        price: 100,
        cleaning: true,
      }),
      resolveManualLine(variant, {
        variantId: 'variant-1',
        quantity: 1,
        price: 100,
        cuttingStyleId: 'style-fillet',
      }),
    ];

    expect(manualOrderTotal(lines)).toBe(380); // 240 + 140
  });

  it('is zero for no lines', () => {
    expect(manualOrderTotal([])).toBe(0);
  });
});

// ShareCatalogProducts rows for a single variant, each with `shareCatalog`
// loaded. Dates are spread apart so "most recent" is unambiguous.
const entry = (
  price: number,
  status: ShareCatalogStatus,
  createdAt: string,
  isDeleted = false,
) => ({
  price,
  shareCatalog: { status, createdAt: new Date(createdAt), isDeleted },
});

describe('pickCatalogPrice', () => {
  it('returns null when the variant has never been in a catalog', () => {
    expect(pickCatalogPrice([])).toBeNull();
  });

  it('prefers the LIVE catalog over a newer non-live one', () => {
    const price = pickCatalogPrice([
      entry(120, ShareCatalogStatus.LIVE, '2026-08-01'),
      entry(999, ShareCatalogStatus.INACTIVE, '2026-08-07'),
    ]);

    expect(price).toBe(120);
  });

  it('falls back to the most recently created catalog when none is live', () => {
    const price = pickCatalogPrice([
      entry(100, ShareCatalogStatus.INACTIVE, '2026-07-01'),
      entry(140, ShareCatalogStatus.PAUSED, '2026-08-05'),
      entry(110, ShareCatalogStatus.ACTIVE, '2026-08-02'),
    ]);

    expect(price).toBe(140);
  });

  it('ignores deleted catalogs entirely', () => {
    const price = pickCatalogPrice([
      entry(999, ShareCatalogStatus.LIVE, '2026-08-07', true),
      entry(110, ShareCatalogStatus.INACTIVE, '2026-08-01'),
    ]);

    expect(price).toBe(110);
  });

  it('returns null when every catalog carrying it is deleted', () => {
    expect(
      pickCatalogPrice([entry(999, ShareCatalogStatus.LIVE, '2026-08-07', true)]),
    ).toBeNull();
  });

  it('skips entries whose catalog relation failed to load', () => {
    const price = pickCatalogPrice([
      { price: 999, shareCatalog: null },
      entry(110, ShareCatalogStatus.ACTIVE, '2026-08-01'),
    ]);

    expect(price).toBe(110);
  });
});
