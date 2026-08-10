/**
 * Normalises a phone number to the form WhatsApp stores it in — the raw
 * `wa_id`, i.e. E.164 digits with no `+` (e.g. `919876543210`).
 *
 * `User.phone` is unique and the WhatsApp webhook writes `message.from`
 * verbatim, so any other entry path must land on the identical string or the
 * same customer ends up as two rows with a split order history.
 *
 * Unrecognised lengths are passed through as digits rather than guessed at, so
 * the caller's validation surfaces them instead of us inventing a country code.
 */
export function normalisePhone(raw: string): string {
  let digits = (raw ?? '').replace(/\D/g, '');
  // Indian STD trunk prefix: 0 98765 43210 → 98765 43210.
  if (digits.length === 11 && digits.startsWith('0')) {
    digits = digits.slice(1);
  }
  if (digits.length === 10) {
    return `91${digits}`;
  }
  return digits;
}
