import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { domainToUnicode } from 'node:url';
import { toAscii } from '../src/core/idn';
import { toSimpleCsv, toCsv, toTsv, type ExportRow } from '../src/ui/csv';

const CLIP = { unit: 'grapheme' as const, maxLength: 20 };
const CSV_HEADERS = ['h1', 'h2'];
const EXPORT_HEADERS = ['Domain', 'Status', '1st year', 'Renewal', '3-yr total'];

// Digit-leading labels parse as IPv4 — labels must start g-z or non-ASCII.
const ORACLE_CHAR = fc
  .oneof(
    fc.integer({ min: 0x61, max: 0x7a }),
    fc.integer({ min: 0x30, max: 0x39 }),
    fc.integer({ min: 0x0410, max: 0x044f }),
    fc.integer({ min: 0x03b1, max: 0x03c9 }),
    fc.integer({ min: 0x4e00, max: 0x4eff }),
  )
  .map((cp) => String.fromCodePoint(cp));

const ORACLE_FIRST = fc
  .oneof(
    fc.integer({ min: 0x67, max: 0x7a }),
    fc.integer({ min: 0x0410, max: 0x044f }),
    fc.integer({ min: 0x03b1, max: 0x03c9 }),
    fc.integer({ min: 0x4e00, max: 0x4eff }),
  )
  .map((cp) => String.fromCodePoint(cp));

const ORACLE_LABEL = fc
  .tuple(ORACLE_FIRST, fc.string({ unit: ORACLE_CHAR, maxLength: 14 }))
  .map(([first, rest]) => first + rest);

const ORACLE_DOMAIN = fc
  .array(ORACLE_LABEL, { minLength: 1, maxLength: 3 })
  .map((labels) => labels.join('.'));

function parseCsvRfc4180(text: string): string[][] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i] ?? '';
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\r' && src[i + 1] === '\n') {
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
      i++;
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

describe('idn: punycode on unicode fuzz', () => {
  it('toAscii emits pure ASCII', () => {
    fc.assert(
      fc.property(fc.string(CLIP), (s) => {
        const allAscii = [...toAscii(s)].every((ch) => (ch.codePointAt(0) ?? 0) < 128);
        expect(allAscii).toBe(true);
      }),
    );
  });

  it('toAscii is idempotent', () => {
    fc.assert(
      fc.property(fc.string(CLIP), (s) => {
        const once = toAscii(s);
        expect(toAscii(once)).toBe(once);
      }),
    );
  });

  it('WHATWG decoder inverts toAscii on letter/digit domains (NFKC + lowercase)', () => {
    fc.assert(
      fc.property(ORACLE_DOMAIN, (domain) => {
        const expected = domain.normalize('NFKC').toLowerCase();
        expect(domainToUnicode(toAscii(domain))).toBe(expected);
      }),
    );
  });
});

describe('csv: quoting/escaping round-trip on fuzz', () => {
  it('toSimpleCsv round-trips arbitrary unicode fields', () => {
    fc.assert(
      fc.property(
        fc.array(fc.array(fc.string(CLIP), { minLength: 2, maxLength: 2 }), {
          maxLength: 10,
        }),
        (rows) => {
          expect(parseCsvRfc4180(toSimpleCsv(rows, CSV_HEADERS))).toEqual([
            CSV_HEADERS,
            ...rows,
          ]);
        },
      ),
    );
  });

  it('toCsv round-trips arbitrary ExportRow values', () => {
    const s = fc.string(CLIP);
    fc.assert(
      fc.property(s, s, s, s, s, (domain, status, first, renew, tco) => {
        const row: ExportRow = {
          domain,
          status,
          priceFirstYear: first,
          priceRenewal: renew,
          priceTco: tco,
        };
        expect(parseCsvRfc4180(toCsv([row], EXPORT_HEADERS))).toEqual([
          EXPORT_HEADERS,
          [domain, status, first, renew, tco],
        ]);
      }),
    );
  });

  it('toTsv sanitizes separators so every line keeps 5 fields', () => {
    const s = fc.string(CLIP);
    fc.assert(
      fc.property(s, s, s, s, s, (domain, status, first, renew, tco) => {
        const row: ExportRow = {
          domain,
          status,
          priceFirstYear: first,
          priceRenewal: renew,
          priceTco: tco,
        };
        const lines = toTsv([row], EXPORT_HEADERS).split('\n');
        const fields = (lines[1] ?? '').split('\t');
        expect(fields).toHaveLength(5);
        expect(fields).toEqual(
          [domain, status, first, renew, tco].map((v) => v.replace(/[\t\r\n]/g, ' ')),
        );
      }),
    );
  });
});
