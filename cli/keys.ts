const KEYS_STORAGE_KEY = 'dh:cli:registrar-keys';

export const SUPPORTED_KEY_REGISTRARS = ['dynadot'] as const;
export type KeyRegistrar = (typeof SUPPORTED_KEY_REGISTRARS)[number];

export function isKeyRegistrar(v: string | undefined): v is KeyRegistrar {
  return v != null && (SUPPORTED_KEY_REGISTRARS as readonly string[]).includes(v);
}

/** Read stored registrar API keys from the file-backed shim (mode 0600). */
export function loadRegistrarKeys(): Partial<Record<KeyRegistrar, string>> {
  try {
    const raw = localStorage.getItem(KEYS_STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (parsed == null || typeof parsed !== 'object') return {};
    const out: Partial<Record<KeyRegistrar, string>> = {};
    for (const id of SUPPORTED_KEY_REGISTRARS) {
      const v = (parsed as Record<string, unknown>)[id];
      if (typeof v === 'string' && v !== '') out[id] = v;
    }
    return out;
  } catch {
    return {};
  }
}

export function saveRegistrarKey(registrar: KeyRegistrar, key: string): void {
  const all = loadRegistrarKeys();
  all[registrar] = key;
  localStorage.setItem(KEYS_STORAGE_KEY, JSON.stringify(all));
}

export function removeRegistrarKey(registrar: KeyRegistrar): boolean {
  const all = loadRegistrarKeys();
  if (all[registrar] == null) return false;
  delete all[registrar];
  localStorage.setItem(KEYS_STORAGE_KEY, JSON.stringify(all));
  return true;
}

export function maskKey(key: string): string {
  return key.length <= 4 ? '****' : `****${key.slice(-4)}`;
}
