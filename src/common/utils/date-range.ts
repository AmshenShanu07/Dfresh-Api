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

export type RangeKey = 'today' | 'yesterday' | 'last7';

export const RANGE_KEYS: RangeKey[] = ['today', 'yesterday', 'last7'];

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

/** The UTC instant at which the given IST calendar day begins. */
function istMidnight(ymd: string): Date {
  return fromZonedTime(`${ymd}T00:00:00`, IST_TZ);
}

/**
 * Resolves a preset key to a concrete [from, to) instant pair.
 *  - today     — the current IST day.
 *  - yesterday — the IST day before the current one.
 *  - last7     — the 7 IST days ending today inclusive (i.e. today-6 .. today).
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
    case 'today':
    default:
      return { from: istMidnight(todayIST), to: tomorrow };
  }
}

/** Narrowing helper for query params arriving as arbitrary strings. */
export function isRangeKey(value: unknown): value is RangeKey {
  return typeof value === 'string' && RANGE_KEYS.includes(value as RangeKey);
}
