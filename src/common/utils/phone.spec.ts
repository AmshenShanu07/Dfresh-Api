import { normalisePhone } from './phone';

describe('normalisePhone', () => {
  it('prepends the country code to a bare 10-digit number', () => {
    expect(normalisePhone('9876543210')).toBe('919876543210');
  });

  it('strips punctuation and the leading +', () => {
    expect(normalisePhone('+91 98765 43210')).toBe('919876543210');
  });

  it('leaves an already-normalised wa_id untouched', () => {
    expect(normalisePhone('919876543210')).toBe('919876543210');
  });

  it('drops the STD trunk zero', () => {
    expect(normalisePhone('09876543210')).toBe('919876543210');
  });

  it('returns an empty string for empty or null-ish input', () => {
    expect(normalisePhone('')).toBe('');
    expect(normalisePhone(undefined as unknown as string)).toBe('');
  });

  it('leaves an unrecognised length alone rather than guessing', () => {
    // Not 10 digits, not a trunk-zero 11 — pass the digits through so the
    // caller's validation reports it instead of us inventing a country code.
    expect(normalisePhone('12345')).toBe('12345');
  });
});
