import { describe, expect, it } from 'vitest';
import { toggleInList, toggleFavoriteCapped, MAX_FAVORITES } from '../src/ui/favorites';
import { pushEntry, MAX_HISTORY_ENTRIES } from '../src/ui/history';
import type { HistoryEntry } from '../src/types';

function entry(ts: number, query: string, tlds: string[] = ['com']): HistoryEntry {
  return { ts, query, tlds, counts: { total: 1, available: 1, taken: 0, problems: 0 } };
}

describe('favorites toggleInList', () => {
  it('adds a domain and removes it again', () => {
    const added = toggleInList([], 'a.com');
    expect(added).toEqual(['a.com']);
    expect(toggleInList(added, 'a.com')).toEqual([]);
  });

  it('does not mutate the input list', () => {
    const base = ['a.com'];
    const next = toggleInList(base, 'b.com');
    expect(base).toEqual(['a.com']);
    expect(next).toEqual(['a.com', 'b.com']);
  });
});

describe('favorites toggleFavoriteCapped (cap enforcement)', () => {
  it('adds when below the cap', () => {
    const set = new Set<string>(['a.com']);
    const { next, added } = toggleFavoriteCapped(set, 'b.com', 2000);
    expect(added).toBe(true);
    expect(next.has('b.com')).toBe(true);
    expect(next.size).toBe(2);
  });

  it('removes an existing entry even at the cap', () => {
    const set = new Set<string>(['a.com', 'b.com']);
    const { next, added } = toggleFavoriteCapped(set, 'a.com', 2);
    expect(added).toBe(true);
    expect(next.has('a.com')).toBe(false);
    expect(next.size).toBe(1);
  });

  it('rejects a new add when at the cap', () => {
    const set = new Set<string>(['a.com', 'b.com']);
    const { next, added } = toggleFavoriteCapped(set, 'c.com', 2);
    expect(added).toBe(false);
    expect(next.has('c.com')).toBe(false);
    expect(next.size).toBe(2);
  });

  it('does not mutate the input set', () => {
    const set = new Set<string>(['a.com']);
    toggleFavoriteCapped(set, 'b.com', 2000);
    expect(set.size).toBe(1);
  });

  it('default cap is MAX_FAVORITES (2000)', () => {
    expect(MAX_FAVORITES).toBe(2000);
    const set = new Set<string>();
    for (let i = 0; i < MAX_FAVORITES; i++) set.add(`d${i}.com`);
    const { added } = toggleFavoriteCapped(set, 'new.com');
    expect(added).toBe(false);
  });
});

describe('history pushEntry', () => {
  it('prepends the newest entry', () => {
    const list = pushEntry([entry(1, 'midas')], entry(2, 'ai'));
    expect(list.map((e) => e.ts)).toEqual([2, 1]);
  });

  it('dedupes identical query+zones, zone order ignored', () => {
    const first = entry(1, 'midas', ['com', 'dev']);
    const same = entry(5, 'midas', ['dev', 'com']);
    const list = pushEntry([first, entry(2, 'other')], same);
    expect(list).toHaveLength(2);
    expect(list[0]?.ts).toBe(5);
    expect(list.some((e) => e.ts === 1)).toBe(false);
  });

  it('caps the list at MAX_HISTORY_ENTRIES', () => {
    let list: HistoryEntry[] = [];
    for (let i = 0; i < MAX_HISTORY_ENTRIES + 5; i++) {
      list = pushEntry(list, entry(i, `q${i}`));
    }
    expect(list).toHaveLength(MAX_HISTORY_ENTRIES);
    expect(list[0]?.query).toBe(`q${MAX_HISTORY_ENTRIES + 4}`);
  });
});
