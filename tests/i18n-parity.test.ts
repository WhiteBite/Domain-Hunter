import { describe, expect, it } from 'vitest';
import { en } from '../src/i18n/en';
import { ru } from '../src/i18n/ru';
import { es } from '../src/i18n/es';
import { de } from '../src/i18n/de';
import { pt } from '../src/i18n/pt';
import type { Dict } from '../src/i18n';

/** All non-reference locales, keyed by code for readable failure messages. */
const LOCALES: Record<string, Dict> = { ru, es, de, pt };

const enKeys = Object.keys(en).sort();

/** Extract {param} placeholder names from a translation string, sorted. */
function params(s: string): string[] {
  return [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1] ?? '').sort();
}

describe('i18n parity', () => {
  it('every locale exposes the identical key set as en', () => {
    for (const [code, dict] of Object.entries(LOCALES)) {
      const keys = Object.keys(dict).sort();
      expect(keys, `${code} key set`).toEqual(enKeys);
    }
  });

  it('has no empty values in any locale', () => {
    for (const [key, value] of Object.entries(en)) {
      expect(value, `en:${key}`).not.toBe('');
    }
    for (const [code, dict] of Object.entries(LOCALES)) {
      for (const [key, value] of Object.entries(dict)) {
        expect(value, `${code}:${key}`).not.toBe('');
      }
    }
  });

  it('interpolation placeholders match en in every locale', () => {
    for (const [code, dict] of Object.entries(LOCALES)) {
      for (const key of enKeys) {
        const enValue = en[key];
        const locValue = dict[key];
        if (enValue === undefined || locValue === undefined) continue;
        expect(params(locValue), `${code}:${key} params`).toEqual(params(enValue));
      }
    }
  });
});
