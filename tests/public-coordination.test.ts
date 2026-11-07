import { describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { build } from 'esbuild';
import { createSharedRateCoordinator } from '../cli/public-sources/coordination';
import type { ProviderRequest } from '../cli/public-sources/coordination';
import { PUBLIC_ADAPTERS } from '../cli/public-sources/adapters';
import { createPublicSourceService } from '../cli/public-sources/service';

const descriptor = { ...PUBLIC_ADAPTERS.domainee.descriptor, minIntervalMs: 0, localDailyCap: 1 };
const ok: ProviderRequest = { kind: 'ok', signals: [] };

async function inDir(test: (dir: string) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), 'dh-coordination-'));
  try { await test(dir); } finally { await rm(dir, { recursive: true, force: true }); }
}

describe('cross-process public API coordination', () => {
  it('serializes same-provider requests, persists quota across instances, and stores no domains', async () => inDir(async (dir) => {
    const first = createSharedRateCoordinator(dir);
    const second = createSharedRateCoordinator(dir);
    let release!: () => void;
    let started!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const entered = new Promise<void>((resolve) => { started = resolve; });
    const request = vi.fn(async () => { started(); await gate; return ok; });
    const initial = first.run('domainee', descriptor, request);
    await entered;
    expect((await second.run('domainee', descriptor, async () => ok)).kind).toBe('busy');
    expect((await second.run('dotsweep', { ...PUBLIC_ADAPTERS.dotsweep.descriptor, minIntervalMs: 0 }, async () => ok)).kind).toBe('ok');
    release();
    expect((await initial).kind).toBe('ok');
    expect((await second.run('domainee', descriptor, async () => ok)).kind).toBe('quota_exhausted');
    const content = await readFile(join(dir, 'domainee.json'), 'utf8');
    expect(content).not.toContain('example.com');
    expect(JSON.parse(content).requests).toHaveLength(1);
    expect((await stat(join(dir, 'domainee.json'))).mode & 0o777).toBe(0o600);
    expect(request).toHaveBeenCalledTimes(1);
  }));

  it('applies shared quota through independent source services', async () => inDir(async (dir) => {
    const adapters = { ...PUBLIC_ADAPTERS, domainee: { ...PUBLIC_ADAPTERS.domainee, descriptor } };
    const fetch = vi.fn(async () => new Response(JSON.stringify({ ok: true, data: { name: 'a', results: [{ tld: 'com', fqdn: 'a.com', available: true, method: 'rdap' }] } }), { status: 200 })) as unknown as typeof globalThis.fetch;
    const first = createPublicSourceService(fetch, adapters, createSharedRateCoordinator(dir));
    const second = createPublicSourceService(fetch, adapters, createSharedRateCoordinator(dir));
    expect((await first.compare(['a.com'], ['domainee'])).summary[0]?.status).toBe('possibly_available');
    expect((await second.compare(['b.com'], ['domainee'])).sources[0]?.status).toBe('quota_exhausted');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(await readFile(join(dir, 'domainee.json'), 'utf8')).not.toContain('a.com');
  }));

  it('persists 429 cooldown and failed attempts across restarts', async () => inDir(async (dir) => {
    const first = createSharedRateCoordinator(dir);
    const dig = { ...PUBLIC_ADAPTERS.digmyname.descriptor, minIntervalMs: 0, localDailyCap: 2 };
    expect(await first.run('digmyname', dig, async () => ({ kind: 'rate_limited', delayMs: 120_000 }))).toMatchObject({ kind: 'rate_limited' });
    const next = createSharedRateCoordinator(dir);
    const request = vi.fn(async () => ok);
    expect(await next.run('digmyname', dig, request)).toMatchObject({ kind: 'rate_limited' });
    expect(request).not.toHaveBeenCalled();
    const failed = { ...descriptor, localDailyCap: 1 };
    expect((await first.run('domainee', failed, async () => ({ kind: 'failed' }))).kind).toBe('failed');
    expect((await next.run('domainee', failed, request)).kind).toBe('quota_exhausted');
    expect(request).not.toHaveBeenCalled();
  }));

  it('fails closed on corrupt or unwritable state without contacting a provider', async () => inDir(async (dir) => {
    await writeFile(join(dir, 'domainee.json'), 'bad json');
    const request = vi.fn(async () => ok);
    expect((await createSharedRateCoordinator(dir).run('domainee', descriptor, request)).kind).toBe('coordination_error');
    await writeFile(join(dir, 'domainee.json'), JSON.stringify({ version: 1, requests: [], lastFinished: Number.MAX_SAFE_INTEGER, blockedUntil: 0 }));
    expect((await createSharedRateCoordinator(dir).run('domainee', descriptor, request)).kind).toBe('coordination_error');
    const filePath = join(dir, 'not-a-directory');
    await writeFile(filePath, 'x');
    expect((await createSharedRateCoordinator(filePath).run('domainee', descriptor, request)).kind).toBe('coordination_error');
    expect(request).not.toHaveBeenCalled();
  }));

  it('enforces the lock across actual Node processes', async () => inDir(async (dir) => {
    const outfile = join(dir, 'coordination.mjs');
    await build({ entryPoints: [resolve('cli/public-sources/coordination.ts')], outfile, bundle: true, platform: 'node', format: 'esm',
      banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" }, logLevel: 'silent' });
    let release!: () => void;
    let started!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const entered = new Promise<void>((resolve) => { started = resolve; });
    const parent = createSharedRateCoordinator(dir).run('domainee', descriptor, async () => { started(); await gate; return ok; });
    await entered;
    try {
      const code = `import { createSharedRateCoordinator } from ${JSON.stringify(pathToFileURL(outfile).href)};\n` +
        `const d = ${JSON.stringify(descriptor)};\n` +
        `const r = await createSharedRateCoordinator(${JSON.stringify(dir)}).run('domainee', d, async () => ({kind:'ok', signals:[]})); console.log(r.kind);`;
      const output = execFileSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8', timeout: 5000 });
      expect(output.trim()).toBe('busy');
    } finally { release(); await parent; }
  }));
});
