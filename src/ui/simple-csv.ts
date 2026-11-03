/** Generic CSV with BOM and RFC 4180 quoting, shared with the CLI. */
export function toSimpleCsv(rows: string[][], headers: string[]): string {
  const escape = (field: string): string => /[",\r\n]/.test(field)
    ? '"' + field.replace(/"/g, '""') + '"' : field;
  const lines = [headers.map(escape).join(',')];
  for (const row of rows) lines.push(row.map(escape).join(','));
  return '\ufeff' + lines.join('\r\n') + '\r\n';
}
