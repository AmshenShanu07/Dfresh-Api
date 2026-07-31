/**
 * Date-range presets for the admin dashboard and order list filters.
 *
 * All boundaries are IST (Asia/Kolkata) day boundaries, not UTC ones — the
 * business runs in Kochi, so "today" must mean the Indian calendar day even
 * though Postgres stores timestamps in UTC. This mirrors how the share-catalog
 * cron interprets its schedule windows (see share-catlaog.window.ts).
 *
 * Ranges are half-open: [from, to). `to` is the *start* of the day after the
 * range, so a `createdAt >= from AND createdAt < to` filter needs no
 * end-of-day fudging (23:59:59.999) to be exact.
 */
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';

export const IST_TZ = 'Asia/Kolkata';

export type RangeKey =
  | 'today'
  | 'yesterday'
  | 'last7'
  | 'last30'
  | 'thisMonth'
  | 'lastMonth';

export const RANGE_KEYS: RangeKey[] = [
  'today',
  'yesterday',
  'last7',
  'last30',
  'thisMonth',
  'lastMonth',
];

export interface DateRange {
  from: Date;
  to: Date;
}

/** Shifts a yyyy-MM-dd string by whole days, staying in the same calendar. */
function shiftYmd(ymd: string, deltaDays: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${dt.getUTCFullYear()}-${mm}-${dd}`;
}

/** The first day of the month the given yyyy-MM-dd falls in. */
function monthStartYmd(ymd: string): string {
  const [y, m] = ymd.split('-').map(Number);
  return `${y}-${String(m).padStart(2, '0')}-01`;
}

/**
 * Shifts a yyyy-MM-dd to the first day of a neighbouring month. Built on
 * Date.UTC(y, m - 1 + delta, 1), which normalises a month index of -1 or 12
 * into the adjacent year — so December → January needs no special case.
 */
function shiftMonthYmd(ymd: string, deltaMonths: number): string {
  const [y, m] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + deltaMonths, 1));
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  return `${dt.getUTCFullYear()}-${mm}-01`;
}

/** The UTC instant at which the given IST calendar day begins. */
function istMidnight(ymd: string): Date {
  return fromZonedTime(`${ymd}T00:00:00`, IST_TZ);
}

/** Rejects anything that isn't a real yyyy-MM-dd calendar date. */
function isValidYmd(ymd: unknown): ymd is string {
  if (typeof ymd !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return false;
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  // Round-trips only if the day actually exists — rejects 2026-02-30.
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

/**
 * Resolves a preset key to a concrete [from, to) instant pair.
 *  - today     — the current IST day.
 *  - yesterday — the IST day before the current one.
 *  - last7     — the 7 IST days ending today inclusive (i.e. today-6 .. today).
 *  - last30    — the 30 IST days ending today inclusive (today-29 .. today).
 *  - thisMonth — month-to-date: the 1st of the current IST month up to and
 *                including today. NOT the whole calendar month; a report for
 *                "this month" that ran to the 31st would pad the period with
 *                days that haven't happened, which silently deflates every
 *                per-day average. Same "ending today inclusive" rule as last7.
 *  - lastMonth — the complete previous calendar month, 1st to last day.
 *
 * Unknown keys fall back to `today` so a bad value can never widen the range.
 */
export function resolveRange(key: RangeKey, now: Date = new Date()): DateRange {
  const todayIST = formatInTimeZone(now, IST_TZ, 'yyyy-MM-dd');
  const tomorrow = istMidnight(shiftYmd(todayIST, 1));

  switch (key) {
    case 'yesterday':
      return {
        from: istMidnight(shiftYmd(todayIST, -1)),
        to: istMidnight(todayIST),
      };
    case 'last7':
      return { from: istMidnight(shiftYmd(todayIST, -6)), to: tomorrow };
    case 'last30':
      return { from: istMidnight(shiftYmd(todayIST, -29)), to: tomorrow };
    case 'thisMonth':
      return { from: istMidnight(monthStartYmd(todayIST)), to: tomorrow };
    case 'lastMonth':
      return {
        from: istMidnight(shiftMonthYmd(todayIST, -1)),
        to: istMidnight(monthStartYmd(todayIST)),
      };
    case 'today':
    default:
      return { from: istMidnight(todayIST), to: tomorrow };
  }
}

/** Narrowing helper for query params arriving as arbitrary strings. */
export function isRangeKey(value: unknown): value is RangeKey {
  return typeof value === 'string' && RANGE_KEYS.includes(value as RangeKey);
}

/**
 * An explicit range from two IST calendar dates.
 *
 * `toYmd` is *inclusive* of that whole IST day — a user picking 1 Jul → 31 Jul
 * means "all of July" — so the returned `to` is IST midnight on 1 Aug, keeping
 * the half-open [from, to) invariant every query relies on.
 *
 * Both endpoints are yyyy-MM-dd calendar dates rather than instants on purpose:
 * an ISO timestamp serialised in the browser's local zone would shift the day
 * by 5h30 before it ever reached this function, which is the precise bug this
 * module exists to prevent.
 *
 * Returns null for malformed or inverted input so the caller can fall back to a
 * preset — a bad custom range must never silently mean "everything".
 */
export function resolveCustomRange(
  fromYmd: unknown,
  toYmd: unknown,
): DateRange | null {
  if (!isValidYmd(fromYmd) || !isValidYmd(toYmd)) return null;
  if (fromYmd > toYmd) return null; // yyyy-MM-dd sorts lexicographically
  return { from: istMidnight(fromYmd), to: istMidnight(shiftYmd(toYmd, 1)) };
}

/**
 * The range resolver every report goes through: a custom from/to pair when both
 * are present and valid, otherwise the named preset, otherwise `last7`.
 *
 * Custom wins over `range` when both arrive so a UI that leaves a stale preset
 * in the querystring while sending explicit dates gets the dates it asked for.
 * The default is `last7` rather than the dashboard's `today` because a report
 * opened cold on an empty day would otherwise look broken.
 */
export function resolveReportRange(
  input: { range?: string; from?: string; to?: string },
  now: Date = new Date(),
): DateRange & { key: RangeKey | 'custom' } {
  const custom = resolveCustomRange(input.from, input.to);
  if (custom) return { ...custom, key: 'custom' };

  const key = isRangeKey(input.range) ? input.range : 'last7';
  return { ...resolveRange(key, now), key };
}
