import { format } from 'date-fns';

/**
 * Derives a short, human-readable order/invoice number from data the order
 * already carries — there is no dedicated sequential column. Format:
 *   DF-<yyMMdd of createdAt>-<last 6 of the UUID, uppercased>
 * e.g. `DF-260727-A5953C`. Deterministic and unique enough for a printed
 * receipt/label. Reused by the bill, the label, and the WhatsApp caption.
 */
export function deriveOrderNumber(order: {
  id: string;
  createdAt: Date | string;
}): string {
  const created = new Date(order.createdAt);
  const datePart = isNaN(created.getTime())
    ? '000000'
    : format(created, 'yyMMdd');
  const idPart = String(order.id).replace(/-/g, '').slice(-6).toUpperCase();
  return `DF-${datePart}-${idPart}`;
}

/**
 * Turns whatever a user typed into a search box into something that can be
 * matched against the de-hyphenated UUID text.
 *
 * Because the order number is derived rather than stored, there is no column
 * to compare against — but its tail *is* the last 6 characters of the UUID.
 * So strip the `DF-yyMMdd-` prefix (when present) and hand back the rest, which
 * makes a pasted bill number (`DF-260727-A5953C`), the bare tail (`A5953C`) and
 * a raw UUID fragment all resolve to the same lookup.
 *
 * The date segment is intentionally discarded: the UUID tail is already
 * distinctive, and keeping it would mean an order searched for by number would
 * miss if the caller mistyped a digit of the date.
 */
export function normaliseOrderNumber(term: string): string {
  const compact = term.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return compact.replace(/^DF\d{6}/, '');
}
