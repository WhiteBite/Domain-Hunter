/**
 * CSV export — Excel-compatible (BOM + comma delimiter + CRLF + quoting).
 * Prices sourced from the pricing module via bestEntry + formatPrice.
 */
import type { CheckResult, PricingTable, Settings } from '../types';
import { bestEntry, formatPrice } from '../pricing/pricing';

export interface CsvRow {
  domain: string;
  status: string;
  tld: string;
  priceFirstYear: string;
  priceRenewal: string;
  bestRegistrar: string;
  checkedAt: string;
}

const CSV_HEADERS = [
  'domain',
  'status',
  'tld',
  'priceFirstYear',
  'priceRenewal',
  'bestRegistrar',
  'checkedAt',
] as const;

/**
 * Convert check results to CSV rows with prices from the pricing table.
 * checkedAt is rendered as an ISO 8601 string.
 */
export function resultsToCsvRows(
  results: Map<string, CheckResult>,
  table: PricingTable | null,
  settings: Settings,
): CsvRow[] {
  const rows: CsvRow[] = [];
  for (const result of results.values()) {
    const best = table ? bestEntry(table, result.tld) : null;
    const entry = best?.entry ?? null;
    rows.push({
      domain: result.domain,
      status: result.status,
      tld: result.tld,
      priceFirstYear: formatPrice(entry?.reg ?? null, settings),
      priceRenewal: formatPrice(entry?.renew ?? null, settings),
      bestRegistrar: best?.registrarId ?? '',
      checkedAt: new Date(result.checkedAt).toISOString(),
    });
  }
  return rows;
}

/** Quote a CSV field if it contains comma, quote, or newline (RFC 4180). */
function escapeCsvField(field: string): string {
  if (field.includes(',') || field.includes('"') || field.includes('\n') || field.includes('\r')) {
    return '"' + field.replace(/"/g, '""') + '"';
  }
  return field;
}

/**
 * Build a CSV string from rows: BOM prefix, header row, CRLF line endings,
 * RFC 4180 quoting for fields containing comma/quote/newline.
 */
export function buildCsv(rows: CsvRow[]): string {
  const lines: string[] = [CSV_HEADERS.join(',')];
  for (const row of rows) {
    lines.push(
      [
        row.domain,
        row.status,
        row.tld,
        row.priceFirstYear,
        row.priceRenewal,
        row.bestRegistrar,
        row.checkedAt,
      ]
        .map(escapeCsvField)
        .join(','),
    );
  }
  return '\uFEFF' + lines.join('\r\n') + '\r\n';
}

/** Trigger a browser download of the CSV string as a file. */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
