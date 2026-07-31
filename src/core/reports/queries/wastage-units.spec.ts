import { isWeightUnit, toGrams } from './wastage-units';

/**
 * The wastage report compares numbers that arrive in three different unit
 * conventions. A silent unit mix-up here would not crash — it would produce a
 * plausible-looking variance that is wrong by a factor of 1000.
 */

describe('toGrams', () => {
  it('scales kilograms to grams', () => {
    expect(toGrams(5, 'kg')).toBe(5000);
    expect(toGrams(1.5, 'kg')).toBe(1500);
  });

  it('passes grams through unchanged', () => {
    expect(toGrams(250, 'g')).toBe(250);
  });

  it('accepts the uppercase ProductUnits spelling', () => {
    // Purchase stores 'KG'/'G'; a case-sensitive check would read 5 KG as 5 g.
    expect(toGrams(5, 'KG')).toBe(5000);
    expect(toGrams(250, 'G')).toBe(250);
  });

  it('tolerates surrounding whitespace', () => {
    expect(toGrams(2, ' kg ')).toBe(2000);
  });

  it('returns 0 for non-weight units rather than guessing', () => {
    // A litre is not a gram. Returning the raw number would let a VOLUME
    // product contribute to a weight total.
    expect(toGrams(5, 'L')).toBe(0);
    expect(toGrams(5, 'ml')).toBe(0);
    expect(toGrams(12, 'COUNT')).toBe(0);
  });

  it('returns 0 for missing or unparsable input', () => {
    expect(toGrams(null, 'kg')).toBe(0);
    expect(toGrams(undefined, 'kg')).toBe(0);
    expect(toGrams('abc', 'kg')).toBe(0);
    expect(toGrams(5, null)).toBe(0);
    expect(toGrams(5, '')).toBe(0);
  });

  it('preserves a negative amount, since variances can be negative', () => {
    expect(toGrams(-0.25, 'kg')).toBe(-250);
  });

  it('accepts numeric strings, which is how pg returns numerics', () => {
    expect(toGrams('1.5', 'kg')).toBe(1500);
  });
});

describe('isWeightUnit', () => {
  it('accepts g and kg in either case', () => {
    expect(isWeightUnit('g')).toBe(true);
    expect(isWeightUnit('KG')).toBe(true);
  });

  it('rejects volume, count and junk', () => {
    expect(isWeightUnit('L')).toBe(false);
    expect(isWeightUnit('COUNT')).toBe(false);
    expect(isWeightUnit(undefined)).toBe(false);
  });
});
