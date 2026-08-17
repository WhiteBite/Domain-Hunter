/**
 * Reactive i18n core (Svelte 5 runes in a .svelte.ts module).
 * `t()` reads a module-level $state, so any template expression calling t()
 * re-renders automatically when the locale changes.
 */
let current: 'en' | 'ru' = $state('en');

import { writable } from 'svelte/store';
import { en } from './en';
import { ru } from './ru';

export type Dict = Record<string, string>;
export type Locale = 'en' | 'ru';

const dicts: Record<Locale, Dict> = { en, ru };

export const locale = writable<Locale>('en');
locale.subscribe((value) => {
  current = value;
});

export function setLocaleFromBrowser(): void {
  const nav = typeof navigator !== 'undefined' ? navigator.language?.toLowerCase() : '';
  locale.set(nav.startsWith('ru') ? 'ru' : 'en');
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
