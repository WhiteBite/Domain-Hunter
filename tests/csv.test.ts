import { describe, it, expect } from 'vitest';
import { resultsToCsvRows, buildCsv, resultsToExportRows, toCsv, toTsv, toMarkdown, buyUrlFor, resultsToJson } from '../src/ui/csv';
import type { ExportRow } from '../src/ui/csv';
import type { CheckResult, PricingTable, Settings } from '../src/types';
import { DEFAULT_SETTINGS } from '../src/types';

const settings: Settings = { ...DEFAULT_SETTINGS };

const table: PricingTable = {
  generatedAt: '2026-01-01T00:00:00.000Z',
  sources: ['porkbun'],
  tlds: {
    com: { porkbun: { reg: 1168, renew: 1168, transfer: 1168 } },
    dev: { porkbun: { reg: 875, renew: 1287, transfer: 1287 } },
  },
  coupons: {},
};

describe('resultsToCsvRows', () => {
  it('maps results with prices from the table', () => {
    const results = new Map<string, CheckResult>([
      [
        'myapp.com',
        {
          domain: 'myapp.com',
          tld: 'com',
          status: 'available',
          source: 'rdap',
          checkedAt: Date.parse('2026-01-01T12:00:00.000Z'),
        },
      ],
      [
        'web.dev',
        {
          domain: 'web.dev',
          tld: 'dev',
          status: 'taken',
          source: 'rdap',
          checkedAt: Date.parse('2026-01-01T12:00:00.000Z'),
        },
      ],
    ]);
    const rows = resultsToCsvRows(results, table, settings);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.domain).toBe('myapp.com');
    expect(rows[0]?.priceFirstYear).toBe('$11.68');
    expect(rows[0]?.priceRenewal).toBe('$11.68');
    expect(rows[0]?.bestRegistrar).toBe('porkbun');
    expect(rows[0]?.buyUrl).toBe('https://porkbun.com/checkout/search?q=myapp.com');
    expect(rows[0]?.checkedAt).toBe('2026-01-01T12:00:00.000Z');
    expect(rows[1]?.priceFirstYear).toBe('$8.75');
  });

  it('handles null table with em-dash prices', () => {
    const results = new Map<string, CheckResult>([
      [
        'x.com',
        { domain: 'x.com', tld: 'com', status: 'unknown', source: 'rdap', checkedAt: 0 },
      ],
    ]);
    const rows = resultsToCsvRows(results, null, settings);
    expect(rows[0]?.priceFirstYear).toBe('—');
    expect(rows[0]?.priceRenewal).toBe('—');
    expect(rows[0]?.bestRegistrar).toBe('');
  });
});

describe('buildCsv', () => {
  const sampleRow = {
    domain: 'a.com',
    status: 'available',
    tld: 'com',
    priceFirstYear: '$11.68',
    priceRenewal: '$11.68',
    bestRegistrar: 'porkbun',
    buyUrl: 'https://porkbun.com/checkout/search?q=a.com',
    checkedAt: '2026-01-01T00:00:00.000Z',
  };

  const defaultHeaders = [
    'Domain',
    'Status',
    'TLD',
    'First year',
    'Renewal',
    'Cheapest registrar',
    'Buy URL',
    'Checked at',
  ];

  it('starts with BOM', () => {
    const csv = buildCsv([], defaultHeaders);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });

  it('contains header row', () => {
    const csv = buildCsv([], defaultHeaders);
    expect(csv).toContain(
      'Domain,Status,TLD,First year,Renewal,Cheapest registrar,Buy URL,Checked at',
    );
  });

  it('uses CRLF line endings', () => {
    const csv = buildCsv([sampleRow], defaultHeaders);
    expect(csv).toContain('\r\n');
    expect(csv).not.toContain('\n\r');
  });

  it('does not quote simple fields', () => {
    const csv = buildCsv([sampleRow], defaultHeaders);
    expect(csv).toContain('a.com,available,com');
  });

  it('quotes fields containing commas', () => {
    const csv = buildCsv([{ ...sampleRow, domain: 'a,b.com' }], defaultHeaders);
    expect(csv).toContain('"a,b.com"');
  });

  it('quotes fields containing double-quotes and doubles them', () => {
    const csv = buildCsv([{ ...sampleRow, domain: 'a"b.com' }], defaultHeaders);
    expect(csv).toContain('"a""b.com"');
  });

  it('quotes fields containing newlines', () => {
    const csv = buildCsv([{ ...sampleRow, status: 'available\nextra' }], defaultHeaders);
    expect(csv).toContain('"available\nextra"');
  });
});

// ---- Clipboard export formats (5-column: CSV / TSV / Markdown) ----

const exportHeaders = ['Domain', 'Status', '1st year', 'Renewal', '3-yr total'];

const exportSample: ExportRow = {
  domain: 'a.com',
  status: 'available',
  priceFirstYear: '$11.68',
  priceRenewal: '$11.68',
  priceTco: '$35.04',
};

describe('resultsToExportRows', () => {
  it('maps results to 5-column rows with TCO and empty prices for null', () => {
    const results = new Map<string, CheckResult>([
      ['myapp.com', { domain: 'myapp.com', tld: 'com', status: 'available', source: 'rdap', checkedAt: Date.parse('2026-01-01T12:00:00.000Z') }],
      ['web.dev', { domain: 'web.dev', tld: 'dev', status: 'taken', source: 'rdap', checkedAt: 0 }],
    ]);
    const rows = resultsToExportRows(results, table, settings);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.domain).toBe('myapp.com');
    expect(rows[0]?.priceFirstYear).toBe('$11.68');
    expect(rows[0]?.priceRenewal).toBe('$11.68');
    expect(rows[0]?.priceTco).toBe('$35.04');
  });

  it('yields empty strings (not em-dash) for null prices', () => {
    const results = new Map<string, CheckResult>([
      ['x.com', { domain: 'x.com', tld: 'com', status: 'unknown', source: 'rdap', checkedAt: 0 }],
    ]);
    const rows = resultsToExportRows(results, null, settings);
    expect(rows[0]?.priceFirstYear).toBe('');
    expect(rows[0]?.priceRenewal).toBe('');
    expect(rows[0]?.priceTco).toBe('');
  });
});

describe('toCsv (clipboard)', () => {
  it('does NOT start with BOM (unlike buildCsv file download)', () => {
    const csv = toCsv([], exportHeaders);
    expect(csv.charCodeAt(0)).not.toBe(0xfeff);
  });

  it('contains header row joined by commas', () => {
    const csv = toCsv([], exportHeaders);
    expect(csv).toContain('Domain,Status,1st year,Renewal,3-yr total');
  });

  it('uses CRLF line endings', () => {
    const csv = toCsv([exportSample], exportHeaders);
    expect(csv).toContain('\r\n');
  });

  it('quotes fields containing commas', () => {
    const csv = toCsv([{ ...exportSample, domain: 'a,b.com' }], exportHeaders);
    expect(csv).toContain('"a,b.com"');
  });

  it('emits empty string for empty price values (no quoting)', () => {
    const csv = toCsv([{ ...exportSample, priceFirstYear: '', priceTco: '' }], exportHeaders);
    expect(csv).toContain('a.com,available,,');
  });
});

describe('toTsv', () => {
  it('does NOT start with BOM', () => {
    const tsv = toTsv([], exportHeaders);
    expect(tsv.charCodeAt(0)).not.toBe(0xfeff);
  });

  it('joins header and rows with tabs, LF endings', () => {
    const tsv = toTsv([exportSample], exportHeaders);
    expect(tsv).toContain('Domain\tStatus\t1st year\tRenewal\t3-yr total');
    expect(tsv).toContain('a.com\tavailable\t$11.68\t$11.68\t$35.04');
    expect(tsv).toContain('\n');
    expect(tsv).not.toContain('\r');
  });

  it('replaces tabs inside values with spaces', () => {
    const tsv = toTsv([{ ...exportSample, domain: 'a\tb.com' }], exportHeaders);
    expect(tsv).toContain('a b.com');
    expect(tsv).not.toContain('a\tb.com');
  });

  it('replaces newlines inside values with spaces', () => {
    const tsv = toTsv([{ ...exportSample, status: 'available\nextra' }], exportHeaders);
    expect(tsv).toContain('available extra');
  });

  it('emits empty string for empty price values', () => {
    const tsv = toTsv([{ ...exportSample, priceFirstYear: '', priceTco: '' }], exportHeaders);
    expect(tsv).toContain('a.com\tavailable\t\t');
  });
});

describe('toMarkdown', () => {
  it('does NOT start with BOM', () => {
    const md = toMarkdown([], exportHeaders);
    expect(md.charCodeAt(0)).not.toBe(0xfeff);
  });

  it('produces a header row, separator, and data rows', () => {
    const md = toMarkdown([exportSample], exportHeaders);
    const lines = md.split('\n');
    expect(lines[0]).toBe('| Domain | Status | 1st year | Renewal | 3-yr total |');
    expect(lines[1]).toBe('| --- | --- | --- | --- | --- |');
    expect(lines[2]).toBe('| a.com | available | $11.68 | $11.68 | $35.04 |');
  });

  it('escapes pipes in values', () => {
    const md = toMarkdown([{ ...exportSample, domain: 'a|b.com' }], exportHeaders);
    expect(md).toContain('a\\|b.com');
    expect(md).not.toMatch(/a\|b\.com/);
  });

  it('escapes newlines in values as <br>', () => {
    const md = toMarkdown([{ ...exportSample, status: 'available\nextra' }], exportHeaders);
    expect(md).toContain('available<br>extra');
    // No literal newline inside the cell.
    const cells = md.split('\n');
    expect(cells[2]).toBe('| a.com | available<br>extra | $11.68 | $11.68 | $35.04 |');
  });

  it('emits empty string for empty price values', () => {
    const md = toMarkdown([{ ...exportSample, priceFirstYear: '', priceTco: '' }], exportHeaders);
    expect(md).toContain('| a.com | available |  | $11.68 |  |');
  });
});

// ---- Buy URL + JSON export ----

describe('buyUrlFor', () => {
  it('builds a deep link for the cheapest registrar with a quote', () => {
    expect(buyUrlFor('com', 'myapp.com', table)).toBe(
      'https://porkbun.com/checkout/search?q=myapp.com',
    );
  });

  it('returns empty string when the table has no quote for the tld', () => {
    expect(buyUrlFor('zzz', 'x.zzz', table)).toBe('');
  });

  it('returns empty string without a pricing table', () => {
    expect(buyUrlFor('com', 'x.com', null)).toBe('');
  });
});

describe('resultsToJson', () => {
  it('emits the versioned schema with raw cents and buyUrl', () => {
    const results = new Map<string, CheckResult>([
      [
        'myapp.com',
        {
          domain: 'myapp.com',
          tld: 'com',
          status: 'available',
          source: 'rdap',
          checkedAt: Date.parse('2026-01-01T12:00:00.000Z'),
        },
      ],
    ]);
    const parsed = JSON.parse(resultsToJson(results, table)) as {
      schema: string;
      generatedAt: string;
      rows: Array<Record<string, unknown>>;
    };
    expect(parsed.schema).toBe('dh-results-v1');
    expect(parsed.generatedAt).toBeTruthy();
    expect(parsed.rows).toHaveLength(1);
    const row = parsed.rows[0];
    expect(row?.domain).toBe('myapp.com');
    expect(row?.priceFirstYearCents).toBe(1168);
    expect(row?.priceRenewalCents).toBe(1168);
    expect(row?.priceTcoCents).toBe(1168 + 2 * 1168);
    expect(row?.bestRegistrar).toBe('porkbun');
    expect(row?.buyUrl).toBe('https://porkbun.com/checkout/search?q=myapp.com');
  });

  it('keeps null prices as null (not formatted strings)', () => {
    const results = new Map<string, CheckResult>([
      ['x.zzz', { domain: 'x.zzz', tld: 'zzz', status: 'unknown', source: 'rdap', checkedAt: 0 }],
    ]);
    const parsed = JSON.parse(resultsToJson(results, table)) as {
      rows: Array<Record<string, unknown>>;
    };
    const row = parsed.rows[0];
    expect(row?.priceFirstYearCents).toBeNull();
    expect(row?.priceTcoCents).toBeNull();
    expect(row?.buyUrl).toBe('');
  });
});
