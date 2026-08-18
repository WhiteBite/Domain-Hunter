import { describe, it, expect } from 'vitest';
import { resultsToCsvRows, buildCsv } from '../src/ui/csv';
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
    checkedAt: '2026-01-01T00:00:00.000Z',
  };

  const defaultHeaders = [
    'Domain',
    'Status',
    'TLD',
    'First year',
    'Renewal',
    'Cheapest registrar',
    'Checked at',
  ];

  it('starts with BOM', () => {
    const csv = buildCsv([], defaultHeaders);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });

  it('contains header row', () => {
    const csv = buildCsv([], defaultHeaders);
    expect(csv).toContain(
      'Domain,Status,TLD,First year,Renewal,Cheapest registrar,Checked at',
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
