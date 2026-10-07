/**
 * Live FX rates — open.er-api.com (no key, open CORS, daily upstream refresh).
 * Pure fetch/parse/TTL logic; the localStorage + settings glue lives in
 * src/ui/fx.ts. Any failure degrades to null — callers keep the stored or
 * manually entered rates.
 */
export const FX_URL = 'https://open.er-api.com/v6/latest/USD';
export const FX_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface FxRates {
  RUB: number;
  EUR: number;
}

export interface FxState {
  rates: FxRates;
  fetchedAt: number;
}

export function parseFxRates(json: unknown): FxRates | null {
  if (typeof json !== 'object' || json === null) return null;
  const rates = (json as { rates?: unknown }).rates;
  if (typeof rates !== 'object' || rates === null) return null;
  const rec = rates as Record<string, unknown>;
  const rub = rec.RUB;
  const eur = rec.EUR;
  if (typeof rub !== 'number' || typeof eur !== 'number') return null;
  if (!Number.isFinite(rub) || !Number.isFinite(eur) || rub <= 0 || eur <= 0) return null;
  return { RUB: rub, EUR: eur };
}

export function isFxStale(state: FxState | null, now: number): boolean {
  if (state === null || !Number.isFinite(state.fetchedAt)) return true;
  return now - state.fetchedAt > FX_TTL_MS;
}

export function ratesEqual(a: FxRates, b: FxRates): boolean {
  return a.RUB === b.RUB && a.EUR === b.EUR;
}

export async function fetchFxRates(fetchImpl: typeof fetch = fetch): Promise<FxRates | null> {
  try {
    const res = await fetchImpl(FX_URL);
    if (!res.ok) return null;
    return parseFxRates(await res.json());
  } catch {
    return null;
  }
}
