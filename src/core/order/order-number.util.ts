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
