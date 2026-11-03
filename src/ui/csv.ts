/**
 * CSV export — Excel-compatible (BOM + comma delimiter + CRLF + quoting).
 * Prices sourced from the pricing module via bestEntry + formatPrice.
 */
import type { CheckResult, PricingTable, RegistrarConfig, Settings } from '../types';
import { bestEntry, bestRenewal, formatPrice, pricingZoneFor } from '../pricing/pricing';
import { applyAffiliate } from './affiliate';
import { pickRegistrar } from './registrar-quotes';
import { priceSourceLabel } from './price-source';
import { advisoryForExport } from './advisory';
import { t } from '../i18n';
import registrarsJson from '../config/registrars.json';

const registrars = registrarsJson as unknown as RegistrarConfig[];

export interface CsvRow {
  domain: string;
  status: string;
  tld: string;
  priceFirstYear: string;
  priceRenewal: string;
  bestRegistrar: string;
  buyUrl: string;
  checkedAt: string;
  resultSource?: string;
  resultNote?: string;
  regSource?: string;
  renewSource?: string;
  lowestRenewal?: string;
  lowestRenewalSeller?: string;
  lowestRenewalSource?: string;
  limitations?: string;
  advisory?: string;
}

/** Buy URL for the displayed cheapest seller; never substitute a different seller. */
export function buyUrlFor(
  tld: string,
  domain: string,
  table: PricingTable | null,
): string {
  const chosen = pickRegistrar(registrars, table, tld).registrar;
  const pick = chosen ? { reg: chosen } : null;
  if (!pick) return '';
  const url = pick.reg.searchUrl.includes('{domain}')
    ? pick.reg.searchUrl.replace('{domain}', encodeURIComponent(domain))
    : pick.reg.searchUrl;
  return applyAffiliate(pick.reg, url);
}

/**
 * Convert check results to CSV rows with prices from the pricing table.
 * checkedAt is rendered as an ISO 8601 string.
 */
export function resultsToCsvRows(
  results: Map<string, CheckResult>,
  table: PricingTable | null,
  settings: Settings,
  premiumDomains: ReadonlySet<string> = new Set(),
): CsvRow[] {
  const rows: CsvRow[] = [];
  for (const result of results.values()) {
    const zone = pricingZoneFor(result.domain, table, result.tld);
    const best = table && !premiumDomains.has(result.domain) ? bestEntry(table, zone) : null;
    const entry = best?.entry ?? null;
    const lowest = table && !premiumDomains.has(result.domain) ? bestRenewal(table, zone) : null;
    const advisory = advisoryForExport(result.domain, result.checkedAt);
    rows.push({
      domain: result.domain,
      status: result.status,
      tld: result.tld,
      priceFirstYear: formatPrice(entry?.reg ?? null, settings),
      priceRenewal: formatPrice(entry?.renew ?? null, settings),
      bestRegistrar: best?.registrarId ?? '',
      buyUrl: best ? buyUrlFor(zone, result.domain, table) : '',
      checkedAt: new Date(result.checkedAt).toISOString(),
      resultSource: result.source,
      resultNote: result.note ?? '',
      regSource: priceSourceLabel(table, zone, best?.registrarId ?? null, 'reg'),
      renewSource: priceSourceLabel(table, zone, best?.registrarId ?? null, 'renew'),
      lowestRenewal: formatPrice(lowest?.renew ?? null, settings),
      lowestRenewalSeller: lowest?.registrarId ?? '',
      lowestRenewalSource: priceSourceLabel(table, zone, lowest?.registrarId ?? null, 'renew'),
      limitations: t('csv.limitationsValue'),
      advisory: advisory ? `${advisory.provider} / ${advisory.verdict} / ${advisory.source}${advisory.confidence ? ` / ${advisory.confidence}` : ''} / ${new Date(advisory.requestedAt).toISOString()} / ${advisory.dataAt ? new Date(advisory.dataAt).toISOString() : 'data time unknown'}` : '',
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
        row.buyUrl,
        row.checkedAt,
        ...(headers.length > 8 ? [row.resultSource ?? '', row.resultNote ?? '', row.regSource ?? '', row.renewSource ?? '', row.lowestRenewal ?? '', row.lowestRenewalSeller ?? '', row.lowestRenewalSource ?? '', row.limitations ?? '', row.advisory ?? ''] : []),
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
  registrationSeller?: string;
  renewalSeller?: string;
  tcoSeller?: string;
  registrationSource?: string;
  renewalSource?: string;
  tcoSource?: string;
  checkedAt?: string;
  resultSource?: string;
  resultNote?: string;
  limitations?: string;
  advisory?: string;
}

/** Field order for the 5-column clipboard formats (matches ExportRow keys). */
const EXPORT_FIELDS: readonly (keyof ExportRow)[] = [
  'domain',
  'status',
  'priceFirstYear',
  'priceRenewal',
  'priceTco',
];
const EXPORT_EXTRA_FIELDS: readonly (keyof ExportRow)[] = [
  'registrationSeller', 'renewalSeller', 'tcoSeller', 'registrationSource', 'renewalSource', 'tcoSource',
  'checkedAt', 'resultSource', 'resultNote', 'limitations', 'advisory',
];
const exportFields = (headers: string[]): readonly (keyof ExportRow)[] =>
  headers.length > EXPORT_FIELDS.length ? [...EXPORT_FIELDS, ...EXPORT_EXTRA_FIELDS] : EXPORT_FIELDS;

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
    const zone = pricingZoneFor(result.domain, table, result.tld);
    const best = table ? bestEntry(table, zone) : null;
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

/** Attach current provenance to the filtered/sorted table view at copy time. */
export function clipboardRows(
  visible: ExportRow[], current: Map<string, CheckResult>, table: PricingTable | null,
  settings: Settings, premiumDomains: ReadonlySet<string>,
): ExportRow[] {
  const provenance = new Map(resultsToCsvRows(current, table, settings, premiumDomains).map((row) => [row.domain, row]));
  return visible.flatMap((row) => {
    const result = current.get(row.domain);
    const info = provenance.get(row.domain);
    if (!result || !info) return [];
    const flagged = premiumDomains.has(row.domain);
    const zone = pricingZoneFor(row.domain, table, result.tld);
    const regSeller = flagged ? '' : row.registrationSeller ?? '';
    const renewalSeller = flagged ? '' : row.renewalSeller ?? '';
    const tcoSeller = flagged ? '' : row.tcoSeller ?? '';
    return [{ ...row, status: result.status,
      priceFirstYear: flagged ? '' : row.priceFirstYear, priceRenewal: flagged ? '' : row.priceRenewal,
      priceTco: flagged ? '' : row.priceTco,
      registrationSeller: regSeller, renewalSeller, tcoSeller,
      registrationSource: priceSourceLabel(table, zone, regSeller, 'reg'),
      renewalSource: priceSourceLabel(table, zone, renewalSeller, 'renew'),
      tcoSource: tcoSeller ? [priceSourceLabel(table, zone, tcoSeller, 'reg'), priceSourceLabel(table, zone, tcoSeller, 'renew')].filter(Boolean).join(' / ') : '',
      checkedAt: info.checkedAt, resultSource: info.resultSource, resultNote: info.resultNote,
      limitations: info.limitations, advisory: info.advisory,
    }];
  });
}

// ---- JSON export (machine-readable, versioned schema) ----

export interface JsonExportRow {
  domain: string;
  status: string;
  tld: string;
  priceFirstYearCents: number | null;
  priceRenewalCents: number | null;
  priceTcoCents: number | null;
  bestRegistrar: string;
  buyUrl: string;
  checkedAt: string;
  resultSource: string;
  resultNote: string | null;
  registrationPriceSource: string;
  renewalPriceSource: string;
  lowestRenewalCents: number | null;
  lowestRenewalRegistrar: string | null;
  lowestRenewalSource: string;
  limitations: string;
  advisory: ReturnType<typeof advisoryForExport>;
}

export interface JsonExport {
  schema: 'dh-results-v1';
  generatedAt: string;
  rows: JsonExportRow[];
}

/** Versioned JSON export: raw USD cents (null-safe) plus buyUrl so results
 *  can be piped into scripts without re-deriving prices. */
export function resultsToJson(
  results: Map<string, CheckResult>,
  table: PricingTable | null,
  premiumDomains: ReadonlySet<string> = new Set(),
): string {
  const rows: JsonExportRow[] = [];
  for (const result of results.values()) {
    const zone = pricingZoneFor(result.domain, table, result.tld);
    const best = table && !premiumDomains.has(result.domain) ? bestEntry(table, zone) : null;
    const entry = best?.entry ?? null;
    const reg = entry?.reg ?? null;
    const renew = entry?.renew ?? null;
    rows.push({
      domain: result.domain,
      status: result.status,
      tld: result.tld,
      priceFirstYearCents: reg,
      priceRenewalCents: renew,
      priceTcoCents: reg != null && renew != null ? reg + 2 * renew : null,
      bestRegistrar: best?.registrarId ?? '',
      buyUrl: best ? buyUrlFor(zone, result.domain, table) : '',
      checkedAt: new Date(result.checkedAt).toISOString(),
      resultSource: result.source,
      resultNote: result.note ?? null,
      registrationPriceSource: priceSourceLabel(table, zone, best?.registrarId ?? null, 'reg'),
      renewalPriceSource: priceSourceLabel(table, zone, best?.registrarId ?? null, 'renew'),
      lowestRenewalCents: table && !premiumDomains.has(result.domain) ? bestRenewal(table, zone)?.renew ?? null : null,
      lowestRenewalRegistrar: table && !premiumDomains.has(result.domain) ? bestRenewal(table, zone)?.registrarId ?? null : null,
      lowestRenewalSource: priceSourceLabel(table, zone, table && !premiumDomains.has(result.domain) ? bestRenewal(table, zone)?.registrarId ?? null : null, 'renew'),
      limitations: t('csv.limitationsValue'),
      advisory: advisoryForExport(result.domain, result.checkedAt),
    });
  }
  const payload: JsonExport = {
    schema: 'dh-results-v1',
    generatedAt: new Date().toISOString(),
    rows,
  };
  return JSON.stringify(payload, null, 2);
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
    lines.push(exportFields(headers).map((f) => escapeCsvField(row[f] ?? '')).join(','));
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
    lines.push(exportFields(headers).map((f) => sanitize(row[f] ?? '')).join('\t'));
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
  const body = rows.map((row) => `| ${exportFields(headers).map((f) => escape(row[f] ?? '')).join(' | ')} |`);
  return [head, sep, ...body].join('\n') + '\n';
}

export { toSimpleCsv } from './simple-csv';
