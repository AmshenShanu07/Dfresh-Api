import { toCsv, toCsvBuffer } from './csv';

/**
 * The CSV export is the one report output an accountant opens in Excel and then
 * sums. Two classes of bug matter: a field that breaks the grid (an unquoted
 * comma in an address), and a field that silently changes meaning (a negative
 * variance turned into text, or a Malayalam name turned into mojibake).
 */

describe('toCsv', () => {
  it('emits a header row followed by body rows, CRLF separated', () => {
    const csv = toCsv(['a', 'b'], [['1', '2'], ['3', '4']]);
    expect(csv).toBe('a,b\r\n1,2\r\n3,4\r\n');
  });

  it('emits just the header when there are no rows', () => {
    expect(toCsv(['a', 'b'], [])).toBe('a,b\r\n');
  });

  describe('quoting', () => {
    it('quotes a field containing the separator', () => {
      expect(toCsv(['x'], [['Kakkanad, Kochi']])).toBe('x\r\n"Kakkanad, Kochi"\r\n');
    });

    it('doubles an embedded quote and wraps the field', () => {
      expect(toCsv(['x'], [['say "hi"']])).toBe('x\r\n"say ""hi"""\r\n');
    });

    it('keeps a newline inside a quoted field rather than breaking the row', () => {
      const csv = toCsv(['x', 'y'], [['line1\nline2', 'ok']]);
      expect(csv).toBe('x,y\r\n"line1\nline2",ok\r\n');
    });

    it('quotes edge whitespace so readers cannot strip it', () => {
      expect(toCsv(['x'], [[' padded ']])).toBe('x\r\n" padded "\r\n');
    });

    it('leaves an ordinary field unquoted', () => {
      expect(toCsv(['x'], [['Tomato']])).toBe('x\r\nTomato\r\n');
    });
  });

  describe('formula-injection guard', () => {
    it.each(['=SUM(A1)', '+1+1', '@import', '\tx', '\rx'])(
      'prefixes an apostrophe to %j',
      (input) => {
        // The guard runs before quoting, so the apostrophe always lands
        // immediately before the original first character.
        expect(toCsv(['x'], [[input]])).toContain(`'${input[0]}`);
      },
    );

    it('guards =SUM(A1) exactly', () => {
      expect(toCsv(['x'], [['=SUM(A1)']])).toBe("x\r\n'=SUM(A1)\r\n");
    });

    it('quotes as well as guards when the lead-in is itself a CR', () => {
      // \r would break the row grid, so the guarded field still needs quoting.
      expect(toCsv(['x'], [['\rx']])).toBe('x\r\n"\'\rx"\r\n');
    });

    it('does NOT guard a negative number — the wastage variance must stay summable', () => {
      expect(toCsv(['x'], [['-12.5']])).toBe('x\r\n-12.5\r\n');
      expect(toCsv(['x'], [['-250']])).toBe('x\r\n-250\r\n');
    });

    it('does guard a leading minus that is not a number', () => {
      expect(toCsv(['x'], [['-cmd|calc']])).toBe("x\r\n'-cmd|calc\r\n");
    });
  });

  describe('empty values', () => {
    it('renders null and undefined as an empty field, not "null"', () => {
      expect(toCsv(['a', 'b', 'c'], [[null, undefined, 0]])).toBe('a,b,c\r\n,,0\r\n');
    });
  });

  it('passes a Malayalam product name through unchanged', () => {
    const name = 'വാഴപ്പഴം';
    const csv = toCsv(['product'], [[name]]);
    expect(csv).toBe(`product\r\n${name}\r\n`);
  });

  it('leaves money as a bare number so Excel can sum it', () => {
    // The report layer renders money as "1250.00"; a "₹1,250.00" string would
    // arrive here as text and be unsummable. Guard the contract from this side.
    expect(toCsv(['total'], [['1250.00']])).toBe('total\r\n1250.00\r\n');
  });
});

describe('toCsvBuffer', () => {
  it('prefixes a UTF-8 BOM so Excel reads the file as UTF-8', () => {
    const buf = toCsvBuffer(['x'], [['₹']]);
    expect(buf.subarray(0, 3)).toEqual(Buffer.from([0xef, 0xbb, 0xbf]));
  });

  it('round-trips Malayalam and ₹ byte-for-byte after the BOM', () => {
    const buf = toCsvBuffer(['product', 'total'], [['വാഴപ്പഴം', '1250.00']]);
    expect(buf.toString('utf8')).toBe('﻿product,total\r\nവാഴപ്പഴം,1250.00\r\n');
  });
});
