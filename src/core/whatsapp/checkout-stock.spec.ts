import { uncoverableProductIds } from './checkout-stock';

const catalog = {
  ShareCatalogProducts: [{ variantId: 'v-1kg' }, { variantId: 'v-500g' }],
  ShareCatalogProductStock: [{ productId: 'fish', remainingGrams: 3000 }],
};

const line = (variantId: string, weight: number, quantity: number) => ({
  productId: 'fish',
  variantId,
  quantity,
  variant: { weight },
});

describe('uncoverableProductIds', () => {
  it('passes a cart both the catalog and the outlet can cover', () => {
    const blocked = uncoverableProductIds(
      [line('v-1kg', 1000, 2)],
      catalog,
      new Map([['fish', 2000]]),
    );
    expect([...blocked]).toEqual([]);
  });

  it('sums lines of one product against the outlet stock', () => {
    // 2 × 1 kg + 2 × 500 g = 3 kg: inside the catalog's 3 kg, over the outlet's 2.5 kg.
    const blocked = uncoverableProductIds(
      [line('v-1kg', 1000, 2), line('v-500g', 500, 2)],
      catalog,
      new Map([['fish', 2500]]),
    );
    expect([...blocked]).toEqual(['fish']);
  });

  it('blocks a cart over the catalog allocation even without an outlet', () => {
    const blocked = uncoverableProductIds(
      [line('v-1kg', 1000, 4)],
      catalog,
      null,
    );
    expect([...blocked]).toEqual(['fish']);
  });

  it('blocks a variant the catalog no longer offers', () => {
    const blocked = uncoverableProductIds(
      [line('v-2kg', 2000, 1)],
      catalog,
      null,
    );
    expect([...blocked]).toEqual(['fish']);
  });
});
