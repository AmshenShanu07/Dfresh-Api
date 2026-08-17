import { deriveOrderNumber, normaliseOrderNumber } from './order-number.util';

describe('deriveOrderNumber', () => {
  it('formats from orderSeq, zero-padded to 6 digits', () => {
    expect(
      deriveOrderNumber({
        id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        createdAt: new Date('2026-08-16T11:27:00Z'),
        orderSeq: 123,
      }),
    ).toBe('DF-260816-000123');
  });

  it('gives two different orders different numbers even with the same UUID tail', () => {
    // Both orders happen to share the same last-6 hex chars — the bug the old
    // UUID-substring derivation was exposed to. orderSeq disambiguates them.
    const same = 'ffffff';
    const first = deriveOrderNumber({
      id: `11111111-1111-1111-1111-1111${same}`,
      createdAt: new Date('2026-08-16T11:27:00Z'),
      orderSeq: 1,
    });
    const second = deriveOrderNumber({
      id: `22222222-2222-2222-2222-2222${same}`,
      createdAt: new Date('2026-08-16T11:27:00Z'),
      orderSeq: 2,
    });
    expect(first).not.toBe(second);
  });

  it('falls back to the UUID tail when orderSeq is missing', () => {
    expect(
      deriveOrderNumber({
        id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        createdAt: new Date('2026-08-16T11:27:00Z'),
      }),
    ).toBe('DF-260816-567890');
  });
});

describe('normaliseOrderNumber', () => {
  it('strips the DF-yyMMdd- prefix and leading zeros', () => {
    expect(normaliseOrderNumber('DF-260816-000123')).toBe('123');
  });

  it('accepts the bare padded or unpadded tail', () => {
    expect(normaliseOrderNumber('000123')).toBe('123');
    expect(normaliseOrderNumber('123')).toBe('123');
  });

  it('returns empty for a non-numeric term', () => {
    expect(normaliseOrderNumber('john doe')).toBe('');
  });
});
