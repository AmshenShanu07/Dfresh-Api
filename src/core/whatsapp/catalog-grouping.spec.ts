import {
  SellableEntry,
  UNCATEGORIZED_ID,
  categoryIdOf,
  groupEntriesByCategory,
} from './catalog-grouping';

const entry = (
  productId: string,
  category: { id?: string; name?: string } | null,
): SellableEntry => ({ productId, product: { category } });

describe('groupEntriesByCategory', () => {
  const veg = { id: 'cat-veg', name: 'Vegetables' };
  const meat = { id: 'cat-meat', name: 'Meat' };

  it('groups entries by their category', () => {
    const res = groupEntriesByCategory([
      entry('tomato', veg),
      entry('onion', veg),
      entry('chicken', meat),
    ]);

    expect(res).toEqual([
      { id: 'cat-veg', name: 'Vegetables', productCount: 2 },
      { id: 'cat-meat', name: 'Meat', productCount: 1 },
    ]);
  });

  it('counts a product with several sellable variants only once', () => {
    const res = groupEntriesByCategory([
      entry('chicken', meat), // 500g
      entry('chicken', meat), // 1kg
      entry('chicken', meat), // 2kg
    ]);

    expect(res).toEqual([{ id: 'cat-meat', name: 'Meat', productCount: 1 }]);
  });

  it('orders by product count desc, then name asc', () => {
    const fruits = { id: 'cat-fruit', name: 'Fruits' };
    const res = groupEntriesByCategory([
      entry('chicken', meat),
      entry('mutton', meat),
      entry('apple', fruits),
      entry('tomato', veg),
    ]);

    // Meat has 2; Fruits and Vegetables tie at 1 and break alphabetically.
    expect(res.map((c) => c.name)).toEqual(['Meat', 'Fruits', 'Vegetables']);
  });

  it('buckets products with a missing category under "Other"', () => {
    const res = groupEntriesByCategory([
      entry('mystery', null),
      { productId: 'orphan', product: {} },
      { productId: 'no-product' },
    ]);

    expect(res).toEqual([
      { id: UNCATEGORIZED_ID, name: 'Other', productCount: 3 },
    ]);
  });

  it('keeps a category whose row is inactive or soft-deleted', () => {
    // The helper never sees isActive/isDeleted — stock is the only gate, so a
    // retired category still surfaces while its products are sellable.
    const retired = { id: 'cat-old', name: 'Seasonal' };
    const res = groupEntriesByCategory([entry('mango', retired)]);

    expect(res).toEqual([
      { id: 'cat-old', name: 'Seasonal', productCount: 1 },
    ]);
  });

  it('falls back to "Other" when the category row has no name', () => {
    const res = groupEntriesByCategory([entry('x', { id: 'cat-x' })]);

    expect(res).toEqual([{ id: 'cat-x', name: 'Other', productCount: 1 }]);
  });

  it('returns an empty list for no entries', () => {
    expect(groupEntriesByCategory([])).toEqual([]);
  });
});

describe('categoryIdOf', () => {
  it('returns the category id when present', () => {
    expect(categoryIdOf(entry('tomato', { id: 'cat-veg' }))).toBe('cat-veg');
  });

  it('returns the uncategorized bucket id otherwise', () => {
    expect(categoryIdOf(entry('tomato', null))).toBe(UNCATEGORIZED_ID);
    expect(categoryIdOf({ productId: 'tomato' })).toBe(UNCATEGORIZED_ID);
  });
});
