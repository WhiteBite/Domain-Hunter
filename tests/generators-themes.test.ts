import { describe, it, expect } from 'vitest';
import { themes } from '../src/generators/themes';

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
