/**
 * Theme application: resolves 'system' via matchMedia and sets [data-theme]
 * on <html>. tokens.css keys all colors off that attribute.
 */
import type { Settings } from '../types';

export function applyTheme(theme: Settings['theme']): void {
  const root = document.documentElement;
  let resolved: 'light' | 'dark';
  if (theme === 'system') {
    resolved = window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } else {
    resolved = theme;
  }
  root.dataset.theme = resolved;
}

/** Watch OS theme changes while settings.theme === 'system'. */
export function watchSystemTheme(getTheme: () => Settings['theme']): () => void {
  const mql = window.matchMedia?.('(prefers-color-scheme: dark)');
  if (!mql) return () => {};
  const handler = () => {
    if (getTheme() === 'system') applyTheme('system');
  };
  mql.addEventListener('change', handler);
  return () => mql.removeEventListener('change', handler);
}
