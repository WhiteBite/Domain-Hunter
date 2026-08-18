import { describe, it, expect } from 'vitest';
import { filterDrops, type DroppedDomain } from '../src/core/dropped';

const SAMPLE: DroppedDomain[] = [
  { d: 'midas', tld: 'com' },
  { d: 'midas', tld: 'io' },
  { d: 'goldhub', tld: 'dev' },
  { d: 'karato', tld: 'ai' },
  { d: 'zenlab', tld: 'xyz' },
];

describe('filterDrops', () => {
  it('returns all domains when query is empty and tld is null', () => {
    expect(filterDrops(SAMPLE, '', null)).toEqual(SAMPLE);
  });

  it('returns all domains when query is whitespace-only', () => {
    expect(filterDrops(SAMPLE, '   ', null)).toEqual(SAMPLE);
  });

  it('matches query as substring of the bare label', () => {
    const out = filterDrops(SAMPLE, 'mid', null);
    expect(out).toEqual([
      { d: 'midas', tld: 'com' },
      { d: 'midas', tld: 'io' },
    ]);
  });

  it('matches query as substring of the full d.tld form', () => {
    const out = filterDrops(SAMPLE, 'midas.io', null);
    expect(out).toEqual([{ d: 'midas', tld: 'io' }]);
  });

  it('filters by tld when query is empty', () => {
    const out = filterDrops(SAMPLE, '', 'io');
    expect(out).toEqual([{ d: 'midas', tld: 'io' }]);
  });

  it('combines query and tld filter', () => {
    const out = filterDrops(SAMPLE, 'mid', 'com');
    expect(out).toEqual([{ d: 'midas', tld: 'com' }]);
  });

  it('is case-insensitive on both query and tld', () => {
    expect(filterDrops(SAMPLE, 'MIDAS', 'IO')).toEqual([{ d: 'midas', tld: 'io' }]);
    expect(filterDrops(SAMPLE, 'KarAto', null)).toEqual([{ d: 'karato', tld: 'ai' }]);
  });

  it('returns empty array when nothing matches', () => {
    expect(filterDrops(SAMPLE, 'zzz', null)).toEqual([]);
    expect(filterDrops(SAMPLE, '', 'ru')).toEqual([]);
  });

  it('does not match query spanning label and tld boundary on bare label', () => {
    // 's.c' is not a substring of 'midas' (bare label) but IS a substring of 'midas.com'
    const out = filterDrops(SAMPLE, 's.c', null);
    expect(out).toEqual([{ d: 'midas', tld: 'com' }]);
  });
});
