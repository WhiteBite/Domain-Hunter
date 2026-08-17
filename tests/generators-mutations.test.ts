import { describe, it, expect } from 'vitest';
import { mutate } from '../src/generators/mutations';

describe('mutate', () => {
  it('never returns the input word', () => {
    const out = mutate('midas');
    expect(out).not.toContain('midas');
  });

  it('returns valid alternatives for a simple word', () => {
    const out = mutate('midas');
    expect(out.length).toBeGreaterThan(0);
    // vowel swap i→y
    expect(out).toContain('mydas');
    // s→z
    expect(out).toContain('midaz');
  });

  it('produces ASCII-only lowercase output', () => {
    const out = mutate('Café');
    for (const w of out) {
      expect(w).toMatch(/^[a-z]+$/);
    }
  });

  it('produces output within 3-63 chars', () => {
    const out = mutate('supercalifragilistic');
    for (const w of out) {
      expect(w.length).toBeGreaterThanOrEqual(3);
      expect(w.length).toBeLessThanOrEqual(63);
    }
  });

  it('deduplicates output', () => {
    const out = mutate('test');
    const unique = new Set(out);
    expect(out.length).toBe(unique.size);
  });

  it('applies vowel swap y→i', () => {
    const out = mutate('mystery');
    expect(out).toContain('misteri');
  });

  it('applies doubling of final consonant', () => {
    const out = mutate('cat');
    expect(out).toContain('catt');
  });

  it('applies truncation for longer words', () => {
    const out = mutate('testing');
    expect(out).toContain('testin');
    expect(out).toContain('testi');
  });

  it('applies productive suffixes', () => {
    const out = mutate('midas');
    expect(out).toContain('midaso');
    expect(out).toContain('midasa');
    expect(out).toContain('midasy');
    expect(out).toContain('midasio');
    expect(out).toContain('midasify');
    // 'midas' doesn't end with 'e', so base = 'midas'
    expect(out).toContain('midasly');
    expect(out).toContain('midashq');
  });

  it('strips trailing e before suffixing', () => {
    const out = mutate('make');
    // base = 'mak' (e stripped)
    expect(out).toContain('mako');
    expect(out).toContain('maka');
  });

  it('returns empty for empty input', () => {
    expect(mutate('')).toEqual([]);
  });

  it('returns empty for non-string input', () => {
    // @ts-expect-error testing runtime guard
    expect(mutate(null)).toEqual([]);
    // @ts-expect-error testing runtime guard
    expect(mutate(undefined)).toEqual([]);
  });

  it('handles very short words (no truncation)', () => {
    const out = mutate('cat');
    // 'cat' is 3 chars, truncate only works on >4 chars
    expect(out).not.toContain('ca');
    expect(out).not.toContain('c');
  });
});
