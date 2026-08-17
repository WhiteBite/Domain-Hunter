/**
 * Public i18n barrel. The reactive implementation lives in index.svelte.ts
 * (module-level $state makes t() re-render templates on locale change).
 */
export { locale, setLocaleFromBrowser, t } from './index.svelte';
export type { Dict, Locale } from './index.svelte';
