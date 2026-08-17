import { describe, it, expect } from 'vitest';
import { findHacks } from '../src/generators/hacks';

describe('findHacks', () => {
  it('finds family → fami.ly', () => {
    const out = findHacks(['family'], ['ly']);
    expect(out).toHaveLength(1);
    expect(out[0]!.word).toBe('family');
    expect(out[0]!.domain).toBe('fami.ly');
    expect(out[0]!.tld).toBe('ly');
  });

  it('excludes words shorter than tld + 2', () => {
    // 'fly' is 3 chars, 'ly' is 2 → need ≥4 chars → excluded
    expect(findHacks(['fly'], ['ly'])).toEqual([]);
    // 'apply' is 5 chars → prefix 'app' (3 ≥ 2) → included
    const out = findHacks(['apply'], ['ly']);
    expect(out).toHaveLength(1);
    expect(out[0]!.domain).toBe('app.ly');
  });

  it('excludes words where word length ≤ tld length + 1', () => {
    // 'cat' is 3 chars, 'at' is 2 → 3 ≤ 2+1 → excluded
    expect(findHacks(['cat'], ['at'])).toEqual([]);
  });

  it('requires prefix length ≥ 2', () => {
    // 'fly' with tld 'y' → prefix 'fl' (2 chars) → included
    const out = findHacks(['fly'], ['y']);
    expect(out).toHaveLength(1);
    expect(out[0]!.domain).toBe('fl.y');
    // 'by' with tld 'y' → prefix 'b' (1 char) → excluded
    expect(findHacks(['by'], ['y'])).toEqual([]);
  });

  it('matches longest TLD first (greedy)', () => {
    // 'family' ends with both 'ly' and 'y'; 'ly' is longer → wins
    const out = findHacks(['family'], ['y', 'ly']);
    expect(out).toHaveLength(1);
    expect(out[0]!.tld).toBe('ly');
    expect(out[0]!.domain).toBe('fami.ly');
  });

  it('deduplicates identical domains', () => {
    const out = findHacks(['family', 'family', 'family'], ['ly']);
    expect(out).toHaveLength(1);
  });

  it('caps output at 500', () => {
    const words = Array.from({ length: 1000 }, (_, i) => `test${i}ly`);
    const out = findHacks(words, ['ly']);
    expect(out.length).toBeLessThanOrEqual(500);
  });

  it('handles multiple TLDs', () => {
    const out = findHacks(['family', 'studio', 'mango'], ['ly', 'io', 'go']);
    const domains = out.map((h) => h.domain);
    expect(domains).toContain('fami.ly');
    expect(domains).toContain('stud.io');
    expect(domains).toContain('man.go');
  });

  it('sanitizes non-alpha input', () => {
    const out = findHacks(['FAMILY!'], ['ly']);
    expect(out).toHaveLength(1);
    expect(out[0]!.word).toBe('family');
    expect(out[0]!.domain).toBe('fami.ly');
  });

  it('returns empty for no matches', () => {
    expect(findHacks(['hello', 'world'], ['ly'])).toEqual([]);
  });
});
