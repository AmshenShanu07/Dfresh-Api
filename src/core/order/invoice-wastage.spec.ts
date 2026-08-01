import { MeasurementType } from 'src/common/enums';
import { InvoiceService } from './invoice.service';

/**
 * The wastage figure printed on the bill and the item label is *configured*
 * (ProductVariant.wastageWeight), not measured — the admin-recorded cleaned
 * weight it replaced is gone. That makes the gating rules the whole substance
 * of the feature, so they are asserted directly rather than through a rendered
 * PDF: the existing invoice spec can only recover glyph names, which cannot
 * distinguish "300 g" from "150 g".
 */
describe('InvoiceService wastage', () => {
  const service = new InvoiceService();

  // Private by design — nothing outside the PDF builders should compute this.
  const wastage = (item: any): string => (service as any).wastageWeight(item);

  const item = (over: Record<string, any> = {}) => ({
    cleaning: true,
    quantity: 2,
    product: { measurementType: MeasurementType.WEIGHT },
    variant: { wastageWeight: 150 },
    ...over,
  });

  it('totals the per-unit variant wastage across the ordered quantity', () => {
    // 150 g configured per unit x 2 units. Must be the total, so it lines up
    // with GROSS on the label, which is also a total across the quantity.
    expect(wastage(item())).toBe('300 g');
  });

  it('promotes to kg only on a whole number of kg', () => {
    expect(wastage(item({ quantity: 4 }))).toBe('600 g');
    expect(wastage(item({ variant: { wastageWeight: 500 }, quantity: 4 }))).toBe(
      '2 kg',
    );
    // 1500 g is >= 1kg but not a whole kg, so it stays in grams.
    expect(wastage(item({ variant: { wastageWeight: 500 }, quantity: 3 }))).toBe(
      '1500 g',
    );
  });

  it('is blank when cleaning was not ordered', () => {
    // An uncleaned item is delivered whole; printing a loss against it would
    // tell the customer they lost weight that was never removed.
    expect(wastage(item({ cleaning: false }))).toBe('');
  });

  it('is blank when the variant has no wastage configured', () => {
    expect(wastage(item({ variant: { wastageWeight: 0 } }))).toBe('');
    expect(wastage(item({ variant: {} }))).toBe('');
  });

  it('is blank for a line with no variant', () => {
    expect(wastage(item({ variant: null }))).toBe('');
  });

  it('excludes VOLUME and COUNT products, which hold wastageWeight at 0', () => {
    expect(
      wastage(
        item({
          product: { measurementType: MeasurementType.VOLUME },
          variant: { wastageWeight: 0 },
        }),
      ),
    ).toBe('');
    expect(
      wastage(
        item({
          product: { measurementType: MeasurementType.COUNT },
          variant: { wastageWeight: 0 },
        }),
      ),
    ).toBe('');
  });

  it('does not fall over on a zero quantity or junk wastage', () => {
    expect(wastage(item({ quantity: 0 }))).toBe('');
    expect(wastage(item({ variant: { wastageWeight: null } }))).toBe('');
    expect(wastage(item({ variant: { wastageWeight: 'abc' } }))).toBe('');
  });
});
