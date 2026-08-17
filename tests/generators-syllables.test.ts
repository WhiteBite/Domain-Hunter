import { describe, it, expect } from 'vitest';
import { mixSyllables } from '../src/generators/syllables';

const CONSONANTS = new Set('bcdfghjklmnpqrstvwxyz'.split(''));
const VOWELS = new Set('aeiou'.split(''));

function hasTripleConsonant(word: string): boolean {
  let run = 0;
  for (let i = 0; i < word.length; i++) {
    if (CONSONANTS.has(word.charAt(i))) {
      run++;
      if (run >= 3) return true;
    } else {
      run = 0;
    }
  }
  return false;
}

function hasDoubleVowel(word: string): boolean {
  for (let i = 0; i < word.length - 1; i++) {
    const c = word.charAt(i);
    if (VOWELS.has(c) && c === word.charAt(i + 1)) return true;
  }
  return false;
}

describe('mixSyllables', () => {
  it('returns the requested count (or fewer)', () => {
    const out = mixSyllables({ count: 20, seed: 42 });
    expect(out.length).toBeGreaterThan(0);
    expect(out.length).toBeLessThanOrEqual(20);
  });

  it('is deterministic for the same seed', () => {
    const a = mixSyllables({ count: 50, seed: 123 });
    const b = mixSyllables({ count: 50, seed: 123 });
    expect(a).toEqual(b);
  });

  it('produces different output for different seeds', () => {
    const a = mixSyllables({ count: 50, seed: 1 });
    const b = mixSyllables({ count: 50, seed: 2 });
    expect(a).not.toEqual(b);
  });

  it('respects minSyllables and maxSyllables', () => {
    // With 2-3 syllables, words should be reasonable length
    const out = mixSyllables({ count: 50, minSyllables: 2, maxSyllables: 3, seed: 7 });
    expect(out.length).toBeGreaterThan(0);
    for (const w of out) {
      expect(w.length).toBeGreaterThanOrEqual(4);
      expect(w.length).toBeLessThanOrEqual(12);
    }
  });

  it('produces only lowercase ASCII alpha output', () => {
    const out = mixSyllables({ count: 100, seed: 99 });
    for (const w of out) {
      expect(w).toMatch(/^[a-z]+$/);
    }
  });

  it('caps output at 500', () => {
    const out = mixSyllables({ count: 10000, seed: 1 });
    expect(out.length).toBeLessThanOrEqual(500);
  });

  it('returns empty array for count 0', () => {
    expect(mixSyllables({ count: 0, seed: 1 })).toEqual([]);
  });

  describe('phonotactic invariants over 1000 samples', () => {
    // Generate 1000 words across multiple seeds
    const allWords: string[] = [];
    for (let seed = 1; seed <= 20; seed++) {
      allWords.push(...mixSyllables({ count: 50, seed }));
    }

    it(`generated ${allWords.length} words total`, () => {
      expect(allWords.length).toBeGreaterThanOrEqual(500);
    });

    for (const w of allWords) {
      it(`word "${w}" has no 3+ consecutive consonants`, () => {
        expect(hasTripleConsonant(w)).toBe(false);
      });

      it(`word "${w}" has no double identical vowels`, () => {
        expect(hasDoubleVowel(w)).toBe(false);
      });

      it(`word "${w}" length is 4-12`, () => {
        expect(w.length).toBeGreaterThanOrEqual(4);
        expect(w.length).toBeLessThanOrEqual(12);
      });

      it(`word "${w}" has at least one vowel`, () => {
        expect([...w].some((c) => VOWELS.has(c))).toBe(true);
      });
    }
  });
});
