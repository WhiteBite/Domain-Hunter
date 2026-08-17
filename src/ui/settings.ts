/**
 * localStorage persistence (versioned keys, SPEC §5).
 */
import type { Settings } from '../types';
import { DEFAULT_SETTINGS } from '../types';

export const KEYS = {
  settings: 'dh:v1:settings',
  cache: 'dh:v1:cache',
  pricing: 'dh:v1:pricing',
  bootstrap: 'dh:v1:bootstrap',
  run: 'dh:v1:run',
  wordsets: 'dh:v1:wordsets',
} as const;

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEYS.settings);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      rates: { ...DEFAULT_SETTINGS.rates, ...(parsed.rates ?? {}) },
      defaultTlds: parsed.defaultTlds ?? [...DEFAULT_SETTINGS.defaultTlds],
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(value: Settings): void {
  try {
    localStorage.setItem(KEYS.settings, JSON.stringify(value));
  } catch {
    /* storage full or unavailable — non-fatal */
  }
}

export function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* non-fatal */
  }
}

export function removeKey(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* non-fatal */
  }
}

/** Remove every dh:v1:* key (settings "clear data" action). */
export function clearAllData(): void {
  try {
    const doomed: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('dh:')) doomed.push(key);
    }
    for (const key of doomed) localStorage.removeItem(key);
  } catch {
    /* non-fatal */
  }
}
