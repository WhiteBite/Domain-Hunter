import { describe, it, expect } from 'vitest';
import { normalizeDropsCsv } from '../scripts/harvest-drops.mjs';

describe('normalizeDropsCsv', () => {
  it('keeps valid rows and drops invalid ones', () => {
    const csv = [
      'midas.com', // valid: 5 letters, vowels, no 4+ cons run
      'ab.io', // drop: label too short (2)
      'superlongdomainname.com', // drop: label too long (19)
      'test123.com', // drop: has digits
      'my-site.com', // drop: has hyphen
      'bcdf.com', // drop: no vowel
      'strengths.com', // drop: 4+ consecutive consonants (ngths)
      'midas.com', // drop: duplicate
      'hello.world', // valid
      'alpha.dev', // valid
      'beta.io', // valid: 4 letters, has vowels
      'gamma.net', // valid
    ].join('\n');

    expect(normalizeDropsCsv(csv)).toEqual([
      { d: 'midas', tld: 'com' },
      { d: 'hello', tld: 'world' },
      { d: 'alpha', tld: 'dev' },
      { d: 'beta', tld: 'io' },
      { d: 'gamma', tld: 'net' },
    ]);
  });

  it('drops short labels (length < 4)', () => {
    expect(normalizeDropsCsv('ab.io\nxyz.io\nmidas.com')).toEqual([{ d: 'midas', tld: 'com' }]);
  });

  it('drops long labels (length > 12)', () => {
    expect(normalizeDropsCsv('superlongdomainname.com\nmidas.com')).toEqual([
      { d: 'midas', tld: 'com' },
    ]);
  });

  it('drops labels with digits', () => {
    expect(normalizeDropsCsv('test123.com\nmidas.com')).toEqual([{ d: 'midas', tld: 'com' }]);
  });

  it('drops labels with hyphens', () => {
    expect(normalizeDropsCsv('my-site.com\nmidas.com')).toEqual([{ d: 'midas', tld: 'com' }]);
  });

  it('drops vowel-less labels', () => {
    expect(normalizeDropsCsv('bcdf.com\nmidas.com')).toEqual([{ d: 'midas', tld: 'com' }]);
  });

  it('drops labels with 4+ consecutive consonants (even with a vowel)', () => {
    // 'strengths' has vowel 'e' but 'ngths' = 5 consecutive consonants
    expect(normalizeDropsCsv('strengths.com\nmidas.com')).toEqual([{ d: 'midas', tld: 'com' }]);
  });

  it('keeps labels with exactly 3 consecutive consonants', () => {
    // 'back' has 'ck' (2), 'bank' has 'nk' (2), 'stamp' has 'st' (2) + 'mp' (2)
    // 'scratch' has 'scr' (3) — exactly 3, should be kept
    expect(normalizeDropsCsv('scratch.io')).toEqual([{ d: 'scratch', tld: 'io' }]);
  });

  it('deduplicates', () => {
    expect(normalizeDropsCsv('midas.com\nmidas.com\nmidas.com')).toEqual([
      { d: 'midas', tld: 'com' },
    ]);
  });

  it('caps at maxDomains', () => {
    const csv = ['midas.com', 'hello.world', 'alpha.dev', 'beta.io', 'gamma.net'].join('\n');
    const result = normalizeDropsCsv(csv, 2);
    expect(result).toHaveLength(2);
    expect(result).toEqual([
      { d: 'midas', tld: 'com' },
      { d: 'hello', tld: 'world' },
    ]);
  });

  it('skips empty lines and lines without a dot', () => {
    expect(normalizeDropsCsv('\n\n  \nbar\nmidas.com\n')).toEqual([{ d: 'midas', tld: 'com' }]);
  });

  it('lowercases labels and tlds', () => {
    expect(normalizeDropsCsv('MIDAS.COM\nHello.World')).toEqual([
      { d: 'midas', tld: 'com' },
      { d: 'hello', tld: 'world' },
    ]);
  });

  it('returns empty array for empty input', () => {
    expect(normalizeDropsCsv('')).toEqual([]);
  });
});
