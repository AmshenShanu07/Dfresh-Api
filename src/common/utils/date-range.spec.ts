import {
  resolveRange,
  isRangeKey,
  resolveCustomRange,
  resolveReportRange,
  IST_TZ,
} from './date-range';

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

  describe('last30', () => {
    it('covers 30 IST days ending today inclusive', () => {
      const now = new Date('2026-07-30T08:30:00.000Z');
      const { from, to } = resolveRange('last30', now);

      // today-29 == 2026-07-01
      expect(from.toISOString()).toBe('2026-06-30T18:30:00.000Z');
      expect(to.toISOString()).toBe('2026-07-30T18:30:00.000Z');

      const days = (to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000);
      expect(days).toBe(30);
    });

    it('shares its end boundary with today', () => {
      const now = new Date('2026-07-30T08:30:00.000Z');
      expect(resolveRange('last30', now).to.getTime()).toBe(
        resolveRange('today', now).to.getTime(),
      );
    });
  });

  describe('thisMonth', () => {
    it('runs from the 1st to the end of today, not to the end of the month', () => {
      // 30 Jul — a whole-calendar-month reading would run to 1 Aug and pad the
      // period with two days that have not happened yet.
      const now = new Date('2026-07-30T08:30:00.000Z');
      const { from, to } = resolveRange('thisMonth', now);

      expect(from.toISOString()).toBe('2026-06-30T18:30:00.000Z'); // Jul 1 00:00 IST
      expect(to.toISOString()).toBe('2026-07-30T18:30:00.000Z'); // Jul 31 00:00 IST
    });

    it('is a single IST day when today is the 1st', () => {
      const now = new Date('2026-07-01T08:30:00.000Z');
      const { from, to } = resolveRange('thisMonth', now);
      const today = resolveRange('today', now);

      expect(from.getTime()).toBe(today.from.getTime());
      expect(to.getTime()).toBe(today.to.getTime());
    });
  });

  describe('lastMonth', () => {
    it('spans the complete previous calendar month', () => {
      const now = new Date('2026-07-30T08:30:00.000Z');
      const { from, to } = resolveRange('lastMonth', now);

      expect(from.toISOString()).toBe('2026-05-31T18:30:00.000Z'); // Jun 1 00:00 IST
      expect(to.toISOString()).toBe('2026-06-30T18:30:00.000Z'); // Jul 1 00:00 IST

      const days = (to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000);
      expect(days).toBe(30); // June
    });

    it('crosses a year boundary — January resolves to the whole of December', () => {
      // 2026-01-15 10:00 IST
      const now = new Date('2026-01-15T04:30:00.000Z');
      const { from, to } = resolveRange('lastMonth', now);

      expect(from.toISOString()).toBe('2025-11-30T18:30:00.000Z'); // Dec 1 2025 00:00 IST
      expect(to.toISOString()).toBe('2025-12-31T18:30:00.000Z'); // Jan 1 2026 00:00 IST

      const days = (to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000);
      expect(days).toBe(31); // December
    });

    it('ends exactly where thisMonth begins, with no gap or overlap', () => {
      const now = new Date('2026-07-30T08:30:00.000Z');
      expect(resolveRange('lastMonth', now).to.getTime()).toBe(
        resolveRange('thisMonth', now).from.getTime(),
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
  it('accepts every supported preset', () => {
    expect(isRangeKey('today')).toBe(true);
    expect(isRangeKey('yesterday')).toBe(true);
    expect(isRangeKey('last7')).toBe(true);
    expect(isRangeKey('last30')).toBe(true);
    expect(isRangeKey('thisMonth')).toBe(true);
    expect(isRangeKey('lastMonth')).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isRangeKey('last90')).toBe(false);
    expect(isRangeKey('')).toBe(false);
    expect(isRangeKey(undefined)).toBe(false);
    expect(isRangeKey(7)).toBe(false);
  });
});

describe('resolveCustomRange', () => {
  it('treats the `to` date as inclusive of that whole IST day', () => {
    const range = resolveCustomRange('2026-07-01', '2026-07-31');

    expect(range).not.toBeNull();
    expect(range!.from.toISOString()).toBe('2026-06-30T18:30:00.000Z'); // Jul 1 00:00 IST
    // Start of 1 Aug, so the whole of the 31st is inside the half-open range.
    expect(range!.to.toISOString()).toBe('2026-07-31T18:30:00.000Z');
  });

  it('includes an order placed at 23:59 IST on the `to` date', () => {
    const range = resolveCustomRange('2026-07-01', '2026-07-31')!;
    const lateOrder = new Date('2026-07-31T18:29:00.000Z'); // 23:59 IST on the 31st

    expect(lateOrder.getTime()).toBeLessThan(range.to.getTime());
  });

  it('accepts a single-day range', () => {
    const range = resolveCustomRange('2026-07-15', '2026-07-15')!;
    const days = (range.to.getTime() - range.from.getTime()) / 86_400_000;

    expect(days).toBe(1);
  });

  it('returns null for an inverted range rather than silently swapping it', () => {
    expect(resolveCustomRange('2026-07-31', '2026-07-01')).toBeNull();
  });

  it('returns null for malformed or missing input', () => {
    expect(resolveCustomRange('31-07-2026', '2026-07-01')).toBeNull();
    expect(resolveCustomRange('2026-07-01', 'tomorrow')).toBeNull();
    expect(resolveCustomRange(undefined, undefined)).toBeNull();
    expect(resolveCustomRange('2026-07-01', undefined)).toBeNull();
    // Well-formed but not a real date.
    expect(resolveCustomRange('2026-02-30', '2026-03-01')).toBeNull();
  });
});

describe('resolveReportRange', () => {
  const now = new Date('2026-07-30T08:30:00.000Z');

  it('prefers an explicit custom range over a stale preset', () => {
    const range = resolveReportRange(
      { range: 'today', from: '2026-07-01', to: '2026-07-31' },
      now,
    );

    expect(range.key).toBe('custom');
    expect(range.from.toISOString()).toBe('2026-06-30T18:30:00.000Z');
  });

  it('uses the named preset when no custom dates are given', () => {
    const range = resolveReportRange({ range: 'lastMonth' }, now);

    expect(range.key).toBe('lastMonth');
    expect(range.from.getTime()).toBe(resolveRange('lastMonth', now).from.getTime());
  });

  it('defaults to last7 when nothing is supplied', () => {
    const range = resolveReportRange({}, now);

    expect(range.key).toBe('last7');
    expect(range.from.getTime()).toBe(resolveRange('last7', now).from.getTime());
  });

  it('falls back to the preset when only one custom endpoint arrives', () => {
    const range = resolveReportRange({ range: 'today', from: '2026-07-01' }, now);

    expect(range.key).toBe('today');
  });

  it('falls back to last7 for an unrecognised preset rather than widening', () => {
    const range = resolveReportRange({ range: 'allTime' }, now);

    expect(range.key).toBe('last7');
  });
});
