import { format } from 'date-fns';

/**
 * Derives the human-readable order/invoice number. Format:
 *   DF-<yyMMdd of createdAt>-<orderSeq, zero-padded to 6 digits>
 * e.g. `DF-260727-000123`. `orderSeq` is a DB-generated, sequence-backed
 * column (OrderDetails.orderSeq) unique across the whole table forever, so
 * the resulting number is guaranteed unique platform-wide — not just
 * probably-unique like the old UUID-substring approach. Reused by the bill,
 * the label, every WhatsApp message, and the reports, so the same order
 * always shows the same number everywhere.
 *
 * Falls back to the pre-orderSeq UUID-tail derivation when orderSeq is
 * missing (e.g. a caller that hasn't been updated to select it) so this
 * never throws — it just stops guaranteeing uniqueness for that one call.
 */
export function deriveOrderNumber(order: {
  id: string;
  createdAt: Date | string;
  orderSeq?: number | string | null;
}): string {
  const created = new Date(order.createdAt);
  const datePart = isNaN(created.getTime())
    ? '000000'
    : format(created, 'yyMMdd');
  const idPart =
    order.orderSeq !== undefined &&
    order.orderSeq !== null &&
    order.orderSeq !== ''
      ? String(order.orderSeq).padStart(6, '0')
      : String(order.id).replace(/-/g, '').slice(-6).toUpperCase();
  return `DF-${datePart}-${idPart}`;
}

/**
 * Turns whatever a user typed into a search box into the bare orderSeq
 * digits it should be matched against.
 *
 * Strips the `DF-yyMMdd-` prefix (when present) and any leading zeros, so a
 * pasted bill number (`DF-260727-000123`), the padded tail (`000123`) and the
 * bare number (`123`) all resolve to the same lookup. The date segment is
 * intentionally discarded: orderSeq alone is already unique, and keeping the
 * date would mean a search misses if the caller mistyped a digit of it.
 *
 * Returns '' for anything that isn't (after stripping the prefix) a plain
 * number, since orderSeq is a plain integer column now.
 */
export function normaliseOrderNumber(term: string): string {
  const compact = term.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const tail = compact.replace(/^DF\d{6}/, '');
  const numeric = tail.replace(/^0+(?=\d)/, '');
  return /^\d+$/.test(numeric) ? numeric : '';
}
