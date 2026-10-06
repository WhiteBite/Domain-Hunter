import { toSimpleCsv } from '../src/ui/csv';
import type { CheckOutcome, DropsOutcome, PricesOutcome } from './contract';

export type OutputFormat = 'json' | 'table' | 'csv';

export function isOutputFormat(v: string | true | undefined): v is OutputFormat {
  return v === 'json' || v === 'table' || v === 'csv';
}

function cents(v: number | null): string {
  return v == null ? '-' : (v / 100).toFixed(2);
}

function renderTable(headers: string[], rows: string[][]): string {
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => (r[i] ?? '').length), 0),
  );
  const line = (cells: string[]): string =>
    cells
      .map((c, i) => (c ?? '').padEnd(widths[i] ?? 0))
      .join('  ')
      .trimEnd();
  return [line(headers), ...rows.map(line)].join('\n') + '\n';
}

type Formattable = CheckOutcome | PricesOutcome | DropsOutcome;

export function formatOutcome(outcome: Formattable, format: OutputFormat): string {
  if (format === 'json') return JSON.stringify(outcome, null, 2) + '\n';

  if (outcome.command === 'check') {
    const rows = outcome.results.map((r) => [
      r.domain,
      r.tld,
      r.status,
      r.source,
      r.price?.formatted?.first ?? '',
      r.price?.formatted?.renew ?? '',
    ]);
    const headers = ['domain', 'tld', 'status', 'source', 'price_first', 'price_renew'];
    if (format === 'csv') return toSimpleCsv(rows, headers);
    return renderTable(headers, rows);
  }

  if (outcome.command === 'prices') {
    const rows = outcome.rows.map((r) => [
      r.tld,
      r.best?.registrarId ?? '-',
      cents(r.best?.reg ?? null),
      cents(r.best?.renew ?? null),
      cents(r.tco3UsdCents),
      r.promoTrap ? 'yes' : '',
    ]);
    const headers = ['tld', 'best_registrar', 'reg_usd', 'renew_usd', 'tco3_usd', 'promo_trap'];
    if (format === 'csv') return toSimpleCsv(rows, headers);
    return renderTable(headers, rows);
  }

  const rows = outcome.domains.map((d) => {
    const i = d.lastIndexOf('.');
    return [d, d.slice(i + 1)];
  });
  const headers = ['domain', 'tld'];
  if (format === 'csv') return toSimpleCsv(rows, headers);
  return renderTable(headers, rows);
}
