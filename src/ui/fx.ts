import { get } from 'svelte/store';
import { settings } from './store';
import { KEYS, readJson, writeJson } from './settings';
import { fetchFxRates, isFxStale, ratesEqual, type FxRates, type FxState } from '../pricing/fx';

export function loadFx(): FxState | null {
  const state = readJson<FxState>(KEYS.fx);
  if (state === null || typeof state !== 'object') return null;
  if (typeof state.fetchedAt !== 'number') return null;
  if (typeof state.rates !== 'object' || state.rates === null) return null;
  return state;
}

export function saveFx(rates: FxRates): FxState {
  const state: FxState = { rates, fetchedAt: Date.now() };
  writeJson(KEYS.fx, state);
  return state;
}

/** force=true (Settings button) always applies the fetched rates; the boot
 *  refresh applies them only while the user has not customized rates since
 *  the previous fetch. */
export async function refreshFx(force: boolean): Promise<boolean> {
  const rates = await fetchFxRates();
  if (rates === null) return false;
  const prev = loadFx();
  saveFx(rates);
  if (force || prev === null || ratesEqual(get(settings).rates, prev.rates)) {
    settings.update((s) => ({ ...s, rates }));
  }
  return true;
}

export async function refreshFxIfStale(): Promise<void> {
  if (!isFxStale(loadFx(), Date.now())) return;
  await refreshFx(false);
}
