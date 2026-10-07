import { describe, it, expect } from 'vitest';
import { runDropsCommand, runPriceTrendsCommand } from '../cli/core';
import droppedSnapshot from '../src/config/dropped.snapshot.json';
import pricingSnapshot from '../src/config/pricing.snapshot.json';

const snap = droppedSnapshot as { generatedAt: string; source: string; list: string[] };
const trends =
  (pricingSnapshot as { trends?: Record<string, { pct: number | null; dir: string | null }> })
    .trends ?? {};

describe('runDropsCommand', () => {
  it('returns the bundled snapshot metadata and capped domains', () => {
    const out = runDropsCommand({});
    expect(out.command).toBe('drops');
    expect(out.generatedAt).toBe(snap.generatedAt);
    expect(out.source).toBe(snap.source);
    expect(out.total).toBe(snap.list.length);
    expect(out.domains).toHaveLength(200);
    for (const d of out.domains) expect(d).toContain('.');
  });

  it('filters by query substring', () => {
    const first = snap.list[0] ?? '';
    const label = first.split(' ')[0] ?? '';
    const out = runDropsCommand({ query: label });
    expect(out.total).toBeGreaterThanOrEqual(1);
    for (const d of out.domains) expect(d.toLowerCase()).toContain(label.toLowerCase());
  });

  it('query match also covers the full d.tld form', () => {
    const tld = (snap.list[0] ?? '').split(' ')[1] ?? '';
    const out = runDropsCommand({ query: tld });
    expect(out.total).toBeGreaterThan(0);
    for (const d of out.domains) expect(d).toContain(tld);
  });

  it('filters by tld', () => {
    const tld = (snap.list[0] ?? '').split(' ')[1] ?? '';
    const out = runDropsCommand({ tld });
    expect(out.total).toBeGreaterThan(0);
    for (const d of out.domains) expect(d.endsWith(`.${tld}`)).toBe(true);
  });

  it('clamps limit to [1, 2000]', () => {
    expect(runDropsCommand({ limit: 5 }).domains).toHaveLength(5);
    expect(runDropsCommand({ limit: 0 }).domains).toHaveLength(1);
    expect(runDropsCommand({ limit: 99999 }).domains.length).toBeLessThanOrEqual(2000);
  });
});

describe('runPriceTrendsCommand', () => {
  it('returns precomputed trends with pct/dir shape', () => {
    const out = runPriceTrendsCommand({});
    expect(out.command).toBe('price_trends');
    const keys = Object.keys(out.trends);
    expect(keys.length).toBe(Object.keys(trends).length);
    expect(keys).toEqual([...keys].sort());
    for (const e of Object.values(out.trends)) {
      expect(e).toEqual({ pct: expect.anything(), dir: expect.anything() });
      expect(e).not.toHaveProperty('spark');
    }
  });

  it('filters by exact tlds', () => {
    const anyKey = Object.keys(trends)[0] ?? 'com';
    const out = runPriceTrendsCommand({ tlds: [anyKey] });
    expect(Object.keys(out.trends)).toEqual([anyKey]);
  });

  it('filters by query substring', () => {
    const out = runPriceTrendsCommand({ query: 'co' });
    for (const k of Object.keys(out.trends)) expect(k).toContain('co');
  });

  it('returns an empty map when nothing matches', () => {
    expect(runPriceTrendsCommand({ tlds: ['nonexistentzone'] }).trends).toEqual({});
  });
});
