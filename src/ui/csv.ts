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
 * @param headers - Translated header labels (one per column).
 */
export function buildCsv(rows: CsvRow[], headers: string[]): string {
  const lines: string[] = [headers.join(',')];
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

// ---- Clipboard export formats (CSV / TSV / Markdown) ----

/**
 * 5-column row for clipboard exports: matches the visible table columns
 * (Domain, Status, 1st year, Renewal, 3-year TCO). Prices are pre-formatted
 * via formatPrice; null prices become empty strings (not '—') so pasting
 * into spreadsheets yields empty cells, not literal em-dashes.
 */
export interface ExportRow {
  domain: string;
  status: string;
  priceFirstYear: string;
  priceRenewal: string;
  priceTco: string;
}

/** Field order for the 5-column clipboard formats (matches ExportRow keys). */
const EXPORT_FIELDS: readonly (keyof ExportRow)[] = [
  'domain',
  'status',
  'priceFirstYear',
  'priceRenewal',
  'priceTco',
];

/**
 * Convert check results to 5-column export rows with formatted prices.
 * TCO = first year + 2× renewal at the cheapest registrar (matches the
 * table's detail-row computation). Null prices → empty string.
 */
export function resultsToExportRows(
  results: Map<string, CheckResult>,
  table: PricingTable | null,
  settings: Settings,
): ExportRow[] {
  const rows: ExportRow[] = [];
  for (const result of results.values()) {
    const best = table ? bestEntry(table, result.tld) : null;
    const entry = best?.entry ?? null;
    const reg = entry?.reg ?? null;
    const renew = entry?.renew ?? null;
    const tco = reg != null && renew != null ? reg + 2 * renew : null;
    rows.push({
      domain: result.domain,
      status: result.status,
      priceFirstYear: formatPriceOrEmpty(reg, settings),
      priceRenewal: formatPriceOrEmpty(renew, settings),
      priceTco: formatPriceOrEmpty(tco, settings),
    });
  }
  return rows;
}

/** formatPrice but null → '' (empty cell) instead of '—'. */
function formatPriceOrEmpty(cents: number | null, settings: Settings): string {
  return cents == null ? '' : formatPrice(cents, settings);
}

/**
 * Build a clipboard-friendly CSV string: header row + data rows, CRLF line
 * endings, RFC 4180 quoting (reuses escapeCsvField). No BOM (unlike buildCsv
 * which targets file download for Excel — clipboard paste does not want a
 * BOM prefix).
 */
export function toCsv(rows: ExportRow[], headers: string[]): string {
  const lines: string[] = [headers.join(',')];
  for (const row of rows) {
    lines.push(EXPORT_FIELDS.map((f) => escapeCsvField(row[f])).join(','));
  }
  return lines.join('\r\n') + '\r\n';
}

/**
 * Build a TSV (tab-separated) string for pasting into Excel/Sheets/Notion.
 * Tabs/newlines inside values are replaced with spaces to preserve the
 * one-row-per-line invariant (TSV has no quoting mechanism). LF endings.
 * No BOM.
 */
export function toTsv(rows: ExportRow[], headers: string[]): string {
  const sanitize = (s: string): string => s.replace(/[\t\r\n]/g, ' ');
  const lines: string[] = [headers.map(sanitize).join('\t')];
  for (const row of rows) {
    lines.push(EXPORT_FIELDS.map((f) => sanitize(row[f])).join('\t'));
  }
  return lines.join('\n') + '\n';
}

/**
 * Build a Markdown table string. Pipes in values are escaped as `\|`,
 * newlines as `<br>`. Header row + separator + data rows. No BOM.
 */
export function toMarkdown(rows: ExportRow[], headers: string[]): string {
  const escape = (s: string): string => s.replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');
  const head = `| ${headers.map(escape).join(' | ')} |`;
  const sep = `| ${headers.map(() => '---').join(' | ')} |`;
  const body = rows.map((row) => `| ${EXPORT_FIELDS.map((f) => escape(row[f])).join(' | ')} |`);
  return [head, sep, ...body].join('\n') + '\n';
}
