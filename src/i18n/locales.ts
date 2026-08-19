/**
 * Locale registry — metadata for every supported language.
 * Single source of truth for language names, used by the UI
 * (header toggle, settings dropdown) and locale detection.
 */
import type { Locale } from '../types';

export interface LocaleInfo {
  /** BCP-47 code used internally (e.g. 'pt' for Brazilian Portuguese). */
  code: Locale;
  /** Name in the language itself, shown in the UI (e.g. "Español"). */
  nativeName: string;
  /** English name, for accessibility / tooltips (e.g. "Spanish"). */
  englishName: string;
}

/**
 * All supported locales in display order.
 * English first (default), then by approximate audience size.
 */
export const LOCALES: readonly LocaleInfo[] = [
  { code: 'en', nativeName: 'English', englishName: 'English' },
  { code: 'ru', nativeName: 'Русский', englishName: 'Russian' },
  { code: 'es', nativeName: 'Español', englishName: 'Spanish' },
  { code: 'de', nativeName: 'Deutsch', englishName: 'German' },
  { code: 'pt', nativeName: 'Português', englishName: 'Portuguese' },
] as const;

/** Lookup a locale's metadata by code. Returns undefined for unknown codes. */
export function localeInfo(code: Locale): LocaleInfo | undefined {
  return LOCALES.find((l) => l.code === code);
}

/** The next locale in the cycle (for the header toggle button). */
export function nextLocale(current: Locale): Locale {
  const idx = LOCALES.findIndex((l) => l.code === current);
  const next = LOCALES[(idx + 1) % LOCALES.length];
  return next?.code ?? 'en';
}
