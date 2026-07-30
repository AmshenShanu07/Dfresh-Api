import { resolveRange, isRangeKey, IST_TZ } from './date-range';

/**
 * The dashboard's numbers are only trustworthy if "today" means the Indian
 * calendar day. IST is UTC+5:30, so a naive UTC implementation attributes
 * every order placed between 18:30 and 23:59 IST to the *next* day — which is
 * exactly the evening the share-catalog windows run in. These tests pin the
 * boundaries to IST midnight.
 *
 * Ranges are half-open [from, to): `to` is the start of the following day.
 */

/** IST midnight is 18:30 UTC on the previous calendar day. */
const istMidnightUtc = (ymd: string) => `${ymd}T00:00:00.000+05:30`;

describe('resolveRange', () => {
  it('confirms the timezone it works in', () => {
    expect(IST_TZ).toBe('Asia/Kolkata');
  });

  describe('today', () => {
    it('spans IST midnight to the next IST midnight', () => {
      // 2026-07-30 14:00 IST
      const now = new Date('2026-07-30T08:30:00.000Z');
      const { from, to } = resolveRange('today', now);

      expect(from.toISOString()).toBe(
        new Date(istMidnightUtc('2026-07-30')).toISOString(),
      );
      expect(to.toISOString()).toBe(
        new Date(istMidnightUtc('2026-07-31')).toISOString(),
      );
      // Sanity: IST midnight is 18:30 UTC the day before.
      expect(from.toISOString()).toBe('2026-07-29T18:30:00.000Z');
    });

    it('still resolves to the IST day at 00:30 IST, when UTC is on the previous date', () => {
      // 2026-07-30 00:30 IST == 2026-07-29 19:00 UTC. A UTC-based
      // implementation would wrongly report 2026-07-29 as "today".
      const now = new Date('2026-07-29T19:00:00.000Z');
      const { from, to } = resolveRange('today', now);

      expect(from.toISOString()).toBe('2026-07-29T18:30:00.000Z'); // 30th, 00:00 IST
      expect(to.toISOString()).toBe('2026-07-30T18:30:00.000Z'); // 31st, 00:00 IST
      expect(now.getTime()).toBeGreaterThanOrEqual(from.getTime());
      expect(now.getTime()).toBeLessThan(to.getTime());
    });

    it('includes an order placed at 23:59 IST in the same IST day', () => {
      // A 21:00 IST catalog window order — 15:30 UTC the same date.
      const now = new Date('2026-07-30T08:30:00.000Z');
      const { from, to } = resolveRange('today', now);
      const eveningOrder = new Date('2026-07-30T18:29:00.000Z'); // 23:59 IST

      expect(eveningOrder.getTime()).toBeGreaterThanOrEqual(from.getTime());
      expect(eveningOrder.getTime()).toBeLessThan(to.getTime());
    });
  });

  describe('yesterday', () => {
    it('spans the previous IST day only', () => {
      const now = new Date('2026-07-30T08:30:00.000Z');
      const { from, to } = resolveRange('yesterday', now);

      expect(from.toISOString()).toBe('2026-07-28T18:30:00.000Z'); // 29th 00:00 IST
      expect(to.toISOString()).toBe('2026-07-29T18:30:00.000Z'); // 30th 00:00 IST
    });

    it('ends exactly where today begins, with no gap or overlap', () => {
      const now = new Date('2026-07-30T08:30:00.000Z');
      expect(resolveRange('yesterday', now).to.getTime()).toBe(
        resolveRange('today', now).from.getTime(),
      );
    });

    it('crosses a month boundary correctly', () => {
      // 2026-08-01 10:00 IST
      const now = new Date('2026-08-01T04:30:00.000Z');
      const { from, to } = resolveRange('yesterday', now);

      expect(from.toISOString()).toBe('2026-07-30T18:30:00.000Z'); // Jul 31 00:00 IST
      expect(to.toISOString()).toBe('2026-07-31T18:30:00.000Z'); // Aug 1 00:00 IST
    });
  });

  describe('last7', () => {
    it('covers 7 IST days ending today inclusive', () => {
      const now = new Date('2026-07-30T08:30:00.000Z');
      const { from, to } = resolveRange('last7', now);

      // today-6 == 2026-07-24
      expect(from.toISOString()).toBe('2026-07-23T18:30:00.000Z');
      expect(to.toISOString()).toBe('2026-07-30T18:30:00.000Z');

      const days = (to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000);
      expect(days).toBe(7);
    });

    it('shares its end boundary with today', () => {
      const now = new Date('2026-07-30T08:30:00.000Z');
      expect(resolveRange('last7', now).to.getTime()).toBe(
        resolveRange('today', now).to.getTime(),
      );
    });
  });

  it('falls back to today for an unrecognised key rather than widening', () => {
    const now = new Date('2026-07-30T08:30:00.000Z');
    const bogus = resolveRange('bogus' as any, now);
    const today = resolveRange('today', now);

    expect(bogus.from.getTime()).toBe(today.from.getTime());
    expect(bogus.to.getTime()).toBe(today.to.getTime());
  });
});

describe('isRangeKey', () => {
  it('accepts the three supported presets', () => {
    expect(isRangeKey('today')).toBe(true);
    expect(isRangeKey('yesterday')).toBe(true);
    expect(isRangeKey('last7')).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isRangeKey('last30')).toBe(false);
    expect(isRangeKey('')).toBe(false);
    expect(isRangeKey(undefined)).toBe(false);
    expect(isRangeKey(7)).toBe(false);
  });
});
