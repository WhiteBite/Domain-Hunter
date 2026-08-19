/**
 * Reactive i18n core (Svelte 5 runes in a .svelte.ts module).
 * `t()` reads a module-level $state, so any template expression calling t()
 * re-renders automatically when the locale changes.
 *
 * Supports N locales. Detection: navigator.language → exact match →
 * base-language match → 'en' fallback.
 */
import { writable } from 'svelte/store';
import type { Locale } from '../types';
import { en } from './en';
import { ru } from './ru';
import { es } from './es';
import { de } from './de';
import { pt } from './pt';
import { zh } from './zh';
import { ja } from './ja';
import { fr } from './fr';

export type Dict = Record<string, string>;
export type { Locale };

const dicts: Record<Locale, Dict> = { en, ru, es, de, pt, zh, ja, fr };

let current: Locale = $state('en');

export const locale = writable<Locale>('en');
locale.subscribe((value) => {
  current = value;
});

/**
 * Detect the best locale from navigator.language.
 * Tries exact match first, then base-language match, then falls back to 'en'.
 */
export function detectLocale(): Locale {
  if (typeof navigator === 'undefined') return 'en';
  const nav = navigator.language?.toLowerCase() ?? '';
  // Exact match (e.g. 'pt-br' → 'pt' handled below, 'en-us' → 'en')
  if (nav in dicts) return nav as Locale;
  // Base language match (e.g. 'pt-br' → 'pt', 'de-at' → 'de')
  const base = nav.split('-')[0] ?? '';
  if (base in dicts) return base as Locale;
  return 'en';
}

/** Set locale from browser language. Called once on app mount. */
export function setLocaleFromBrowser(): void {
  locale.set(detectLocale());
}

/** Translate a dot-key with {param} interpolation. Falls back to EN, then to the key itself. */
export function t(key: string, params?: Record<string, string | number>): string {
  let s = dicts[current][key] ?? en[key] ?? key;
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      s = s.split(`{${name}}`).join(String(value));
    }
  }
  return s;
}
