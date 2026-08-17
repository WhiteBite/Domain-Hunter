import { describe, it, expect } from 'vitest';
import { scoreWord, buildModel, scoreWithModel } from '../src/generators/pronounceability';

describe('pronounceability', () => {
  it('ranks a real word above a random consonant heap', () => {
    expect(scoreWord('apple')).toBeGreaterThan(scoreWord('xzqpf'));
  });

  it('ranks multiple real words above consonant heaps', () => {
    const real = ['hello', 'banana', 'planet', 'garden', 'stream'];
    const heaps = ['xzqpf', 'qzxvk', 'bvcxn', 'plmkz', 'wrtbc'];
    for (const real_ of real) {
      for (const heap of heaps) {
        expect(scoreWord(real_)).toBeGreaterThan(scoreWord(heap));
      }
    }
  });

  it('returns a finite number for normal words', () => {
    expect(Number.isFinite(scoreWord('hello'))).toBe(true);
  });

  it('returns -Infinity for single characters', () => {
    expect(scoreWord('a')).toBe(-Infinity);
  });

  it('buildModel returns a model with expected structure', () => {
    const model = buildModel(['cat', 'dog', 'bat']);
    expect(model.monogramCounts).toBeInstanceOf(Map);
    expect(model.bigramCounts).toBeInstanceOf(Map);
    expect(model.vocabularySize).toBeGreaterThan(0);
    expect(model.monogramCounts.get('c')).toBe(1);
    expect(model.bigramCounts.get('ca')).toBe(1);
  });

  it('scoreWithModel works with a custom model', () => {
    const model = buildModel(['cat', 'bat', 'rat', 'hat']);
    // 'at' is a common bigram in this model
    const score = scoreWithModel('cat', model);
    expect(Number.isFinite(score)).toBe(true);
    // 'xz' is unseen → low score
    const badScore = scoreWithModel('xz', model);
    expect(score).toBeGreaterThan(badScore);
  });

  it('handles empty words gracefully', () => {
    expect(scoreWord('')).toBe(-Infinity);
  });

  it('is case-insensitive', () => {
    expect(scoreWord('APPLE')).toBe(scoreWord('apple'));
  });
});
