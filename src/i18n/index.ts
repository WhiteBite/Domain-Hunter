/**
 * Public i18n barrel. The reactive implementation lives in index.svelte.ts
 * (module-level $state makes t() re-render templates on locale change).
 */
export { locale, setLocaleFromBrowser, detectLocale, t } from './index.svelte';
export type { Dict, Locale } from './index.svelte';
export { LOCALES, localeInfo, nextLocale } from './locales';
export type { LocaleInfo } from './locales';
