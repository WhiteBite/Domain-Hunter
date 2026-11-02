import { describe, expect, it } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const script = resolve('scripts/import-reviewed-prices.mjs');
const fixture = (name: string) => resolve('tests/fixtures', name);

function withTemp(fn: (dir: string) => void) {
  const dir = mkdtempSync(join(tmpdir(), 'dh-import-'));
  try { fn(dir); } finally { rmSync(dir, { recursive: true }); }
}

function command(source: string, input: string, snapshot: string, output: string, extra: string[] = []) {
  return [script, '--source', source, '--input', fixture(input), '--observed-at', '2026-11-01T20:00:00Z',
    '--rub-per-usd', '80.572954', '--snapshot', snapshot, '--output', output, ...extra];
}

function baseline(path: string) {
  writeFileSync(path, JSON.stringify({ generatedAt: '2026-01-01T00:00:00Z', sources: ['snapshot'], coupons: {},
    tlds: { ru: { porkbun: [100, 200, 300], hostiman: [1, 2, null] }, obsolete: { hostiman: [3, 4, null] } },
    hostimanUpdatedAt: '2026-10-01T00:00:00Z', sprinthostUpdatedAt: '2026-10-02T00:00:00Z',
    sourceRub: { hostiman: { ru: [50, 60] }, regru: { ru: [100, null] } },
  }));
}

describe('offline reviewed price imports', () => {
  it.each([
    ['hostiman', 'hostiman-sanitized.html', 11],
    ['timeweb', 'timeweb-sanitized.html', 2],
    ['sprinthost', 'sprinthost-annual-sanitized.html', 88],
    ['adminvps', 'adminvps-annual-prices.json', 739],
  ])('imports validated %s data without altering unrelated sources', (source, input, count) => withTemp((dir) => {
    const snapshot = join(dir, 'snapshot.json'); const output = join(dir, 'out.json');
    baseline(snapshot);
    const original = readFileSync(snapshot, 'utf8');
    execFileSync(process.execPath, command(source, input, snapshot, output));
    expect(readFileSync(snapshot, 'utf8')).toBe(original);
    const data = JSON.parse(readFileSync(output, 'utf8'));
    expect(Object.values(data.tlds).filter((x) => Object.hasOwn(x as object, source))).toHaveLength(count);
    expect(data.tlds.ru.porkbun).toEqual([100, 200, 300]);
    expect(data.sourceRub.regru.ru).toEqual([100, null]);
    expect(data[`${source}UpdatedAt`]).toBe('2026-11-01T20:00:00.000Z');
    if (source === 'hostiman') expect(data.tlds.obsolete).toBeUndefined();
    else expect(data.hostimanUpdatedAt).toBe('2026-10-01T00:00:00Z');
    if (source === 'timeweb') expect(data.tlds.ru.timeweb[1]).toBeNull();
    if (source === 'adminvps') expect(data.sourcePromotions.adminvps).toContain('ru');
  }));

  it('retains the separate reviewed WebHOST1 renewal date and excludes conflicting .com', () => withTemp((dir) => {
    const snapshot = join(dir, 'snapshot.json'); const output = join(dir, 'out.json'); baseline(snapshot);
    execFileSync(process.execPath, command('webhost1', 'webhost1-annual-prices.json', snapshot, output,
      ['--renewals', fixture('webhost1-public-observations.json'), '--renewal-observed-at', '2026-11-01T19:00:00Z']));
    const data = JSON.parse(readFileSync(output, 'utf8'));
    expect(data.webhost1RenewalUpdatedAt).toBe('2026-11-01T19:00:00.000Z');
    expect(data.webhost1UpdatedAt).toBe('2026-11-01T20:00:00.000Z');
    expect(data.sourceRub.webhost1.ru).toEqual([18900, 39900]);
    expect(data.tlds.com?.webhost1).toBeUndefined();
  }));

  it('refuses to replace newer WebHOST1 renewals with older observations', () => withTemp((dir) => {
    const snapshot = join(dir, 'snapshot.json'); const output = join(dir, 'out.json'); baseline(snapshot);
    const data = JSON.parse(readFileSync(snapshot, 'utf8'));
    data.webhost1RenewalUpdatedAt = '2026-11-01T19:30:00Z';
    writeFileSync(snapshot, JSON.stringify(data));
    const result = spawnSync(process.execPath, command('webhost1', 'webhost1-annual-prices.json', snapshot, output,
      ['--renewals', fixture('webhost1-public-observations.json'), '--renewal-observed-at', '2026-11-01T19:00:00Z']));
    expect(result.status).toBe(1);
    expect(readFileSync(snapshot, 'utf8')).toBe(JSON.stringify(data));
  }));

  it('refuses old observations, invalid inputs and overwriting files', () => withTemp((dir) => {
    const snapshot = join(dir, 'snapshot.json'); const output = join(dir, 'out.json'); baseline(snapshot);
    const original = readFileSync(snapshot, 'utf8');
    const outdated = command('hostiman', 'hostiman-sanitized.html', snapshot, output);
    outdated[outdated.indexOf('--observed-at') + 1] = '2026-01-01T00:00:00Z';
    expect(spawnSync(process.execPath, outdated).status).toBe(1);
    const invalid = command('hostiman', 'timeweb-sanitized.html', snapshot, output);
    expect(spawnSync(process.execPath, invalid).status).toBe(1);
    const overwrite = command('hostiman', 'hostiman-sanitized.html', snapshot, snapshot);
    expect(spawnSync(process.execPath, overwrite).status).toBe(1);
    expect(readFileSync(snapshot, 'utf8')).toBe(original);
  }));
});
