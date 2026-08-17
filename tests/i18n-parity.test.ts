import { describe, expect, it } from 'vitest';
import { en } from '../src/i18n/en';
import { ru } from '../src/i18n/ru';

describe('i18n parity', () => {
  it('en and ru expose identical key sets', () => {
    const enKeys = Object.keys(en).sort();
    const ruKeys = Object.keys(ru).sort();
    expect(ruKeys).toEqual(enKeys);
  });

  it('has no empty values', () => {
    for (const [key, value] of Object.entries(en)) {
      expect(value, `en:${key}`).not.toBe('');
    }
    for (const [key, value] of Object.entries(ru)) {
      expect(value, `ru:${key}`).not.toBe('');
    }
  });

  it('interpolation placeholders match between locales', () => {
    const params = (s: string): string[] =>
      [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1] ?? '').sort();
    for (const key of Object.keys(en)) {
      const enValue = en[key];
      const ruValue = ru[key];
      if (enValue === undefined || ruValue === undefined) continue;
      expect(params(ruValue), `params in ${key}`).toEqual(params(enValue));
    }
  });
});
