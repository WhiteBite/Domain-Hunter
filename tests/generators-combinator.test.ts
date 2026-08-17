import { describe, it, expect } from 'vitest';
import { combinator, DEFAULT_AFFIXES } from '../src/generators/combinator';

describe('combinator', () => {
  it('produces prefix combinations in prefix mode', () => {
    const out = combinator(['karato'], ['ai', 'hq'], 'prefix');
    expect(out).toContain('aikarato');
    expect(out).toContain('hqkarato');
    expect(out).not.toContain('karatoai');
    expect(out).not.toContain('karatohq');
  });

  it('produces suffix combinations in suffix mode', () => {
    const out = combinator(['karato'], ['ai', 'hq'], 'suffix');
    expect(out).toContain('karatoai');
    expect(out).toContain('karatohq');
    expect(out).not.toContain('aikarato');
  });

  it('produces both prefix and suffix in both mode', () => {
    const out = combinator(['karato'], ['ai'], 'both');
    expect(out).toContain('aikarato');
    expect(out).toContain('karatoai');
  });

  it('deduplicates identical outputs', () => {
    // same root repeated, same affix repeated — no duplicates
    const out = combinator(['foo', 'foo', 'foo'], ['bar', 'bar'], 'both');
    const unique = new Set(out);
    expect(out.length).toBe(unique.size);
    expect(out).toContain('foobar');
    expect(out).toContain('barfoo');
  });

  it('caps output at 500', () => {
    const roots = Array.from({ length: 50 }, (_, i) => `root${i}`);
    const affixes = Array.from({ length: 50 }, (_, i) => `afx${i}`);
    const out = combinator(roots, affixes, 'both');
    expect(out.length).toBeLessThanOrEqual(500);
  });

  it('sanitizes to lowercase ASCII and strips leading/trailing hyphens', () => {
    const out = combinator(['Foo'], ['Bar'], 'suffix');
    expect(out).toEqual(['foobar']);
  });

  it('strips non-ASCII and non-alphanumeric characters', () => {
    const out = combinator(['café'], ['app'], 'prefix');
    expect(out).toContain('appcaf'); // é stripped
    expect(out.every((w) => /^[a-z0-9-]+$/.test(w))).toBe(true);
  });

  it('returns empty array for empty inputs', () => {
    expect(combinator([], ['ai'], 'both')).toEqual([]);
    expect(combinator(['foo'], [], 'both')).toEqual([]);
  });

  it('filters non-string inputs', () => {
    // @ts-expect-error testing runtime guard
    const out = combinator(['foo', null, undefined, 42], ['ai'], 'suffix');
    expect(out).toEqual(['fooai']);
  });

  it('exposes neutral DEFAULT_AFFIXES preset', () => {
    expect(DEFAULT_AFFIXES).toContain('app');
    expect(DEFAULT_AFFIXES).toContain('pro');
    expect(DEFAULT_AFFIXES).toContain('forge');
    expect(DEFAULT_AFFIXES.length).toBeGreaterThanOrEqual(15);
  });
});
