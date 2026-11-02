import { describe, it, expect } from 'vitest';
import { themes } from '../src/generators/themes';
import { createHash } from 'node:crypto';

describe('themes', () => {
  it('has at least 6 categories', () => {
    expect(themes.length).toBeGreaterThanOrEqual(6);
  });

  it.each(themes.map((c) => [c.id, c] as const))(
    'category "%s" has at least 50 words',
    (_id, cat) => {
      expect(cat.words.length).toBeGreaterThanOrEqual(50);
    },
  );

  it.each(themes.map((c) => [c.id, c] as const))(
    'category "%s" has id, labelKey, label, words',
    (_id, cat) => {
      expect(typeof cat.id).toBe('string');
      expect(cat.id.length).toBeGreaterThan(0);
      expect(cat.labelKey).toBe(`gen.themes.cat.${cat.id}`);
      expect(typeof cat.label).toBe('string');
      expect(cat.label.length).toBeGreaterThan(0);
      expect(Array.isArray(cat.words)).toBe(true);
    },
  );

  it('all words are lowercase ASCII alpha with optional hints', () => {
    for (const cat of themes) {
      for (const tw of cat.words) {
        expect(tw.w).toMatch(/^[a-z]+$/);
        expect(tw.w.length).toBeGreaterThanOrEqual(3);
        if (tw.hint !== undefined) {
          expect(typeof tw.hint).toBe('string');
          expect(tw.hint.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('has unique category ids', () => {
    const ids = themes.map((c) => c.id);
    const unique = new Set(ids);
    expect(ids.length).toBe(unique.size);
  });

  it('includes expected categories', () => {
    const ids = themes.map((c) => c.id);
    expect(ids).toContain('animals');
    expect(ids).toContain('nature');
    expect(ids).toContain('food');
    expect(ids).toContain('space');
    expect(ids).toContain('colors');
    expect(ids).toContain('mythology');
    expect(ids).toContain('latin');
  });

  it('preserves meaning hints where source has them', () => {
    const space = themes.find((c) => c.id === 'space');
    expect(space).toBeDefined();
    const withHints = space!.words.filter((w) => w.hint);
    expect(withHints.length).toBeGreaterThan(0);

    const mythology = themes.find((c) => c.id === 'mythology');
    expect(mythology).toBeDefined();
    const mythWithHints = mythology!.words.filter((w) => w.hint);
    expect(mythWithHints.length).toBeGreaterThan(0);
  });
});

// Fingerprints of the expanded original data before compacting the JSON.
// They protect every word, hint and the original order without another corpus copy.
it('compact theme dictionaries round-trip without any data changes', () => {
  const expected: Record<string, string> = {
    animals: 'afb71bae892e588e12ffdb410dd0501c005b0bb48f411451f9343d085e81e2f4',
    nature: 'd74f6511e24f011d20b4bdef06cfb6ce70760c3b07d9b0fe6d418da58e10116d',
    food: '5132696e640971e2bac5ea01c705228d7d8c6d0ee2ae2b1ef4e0bc008acdd5d0',
    space: '1c7624b913dcc56b938a3476b58acaefbeb91cb3a9ae469c9ef03d090d32258e',
    colors: '880c488351e15d52d63a42fc924a1c6be4272b1505b44576ed7a7f000d05000e',
    mythology: '757c143b08f11e27c3de6c3e7d4a17416a2832063f5fa329bbe117aec819b758',
    latin: 'bebbd0ba51e9c8ed086651a322902dab899756aea6659f362dde34caad893c3f',
  };
  for (const category of themes) {
    expect(createHash('sha256').update(JSON.stringify(category.words)).digest('hex')).toBe(expected[category.id]);
  }
});
