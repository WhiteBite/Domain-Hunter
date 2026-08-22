/**
 * App-wide Svelte stores (SPEC §3: src/ui/store.ts).
 * Components consume these; persistence helpers live in ui/settings.ts.
 */
import { writable } from 'svelte/store';
import type {
  Candidate,
  CheckResult,
  PricingTable,
  RunSnapshot,
  Settings,
  TldRegistry,
} from '../types';
import { DEFAULT_SETTINGS } from '../types';
import type { ExportRow } from './csv';
import tldsJson from '../config/tlds.json';

/** Results keyed by full domain. Replaced immutably on updates. */
export const results = writable<Map<string, CheckResult>>(new Map());

export type RunPhase = 'idle' | 'running' | 'done';

export interface RunState {
  phase: RunPhase;
  done: number;
  total: number;
  available: number;
  errors: number;
  startedAt: number;
  elapsedMs: number;
  /** True when a run was cut short by unmount/stop rather than finishing
   *  naturally. History recording skips aborted runs (SPEC §5). */
  aborted?: boolean;
}

export const runState = writable<RunState>({
  phase: 'idle',
  done: 0,
  total: 0,
  available: 0,
  errors: 0,
  startedAt: 0,
  elapsedMs: 0,
});

export const settings = writable<Settings>({ ...DEFAULT_SETTINGS });

export interface PricingState {
  table: PricingTable;
  fetchedAt: number;
  fromCache: boolean;
}

export const pricing = writable<PricingState | null>(null);

/** Curated registry; bootstrap merge may extend tlds at runtime. */
export const registry = writable<TldRegistry>(tldsJson as unknown as TldRegistry);

/** Shared textarea content of the Check tab (generators append here). */
export const checkInput = writable<string>('');

/** Selected TLDs in the Check tab. */
export const selectedTlds = writable<string[]>([...DEFAULT_SETTINGS.defaultTlds]);

/** Active tab id. */
export type TabId = 'check' | 'generators' | 'drops' | 'prices' | 'social' | 'settings' | 'about';
export const activeTab = writable<TabId>('check');

/** Set to true when a share link with run:true should auto-start the check. */
export const pendingShareRun = writable<boolean>(false);

/** Interrupted-run snapshot offered at the top of the Check tab. */
export const resumePrompt = writable<RunSnapshot | null>(null);

/** Decision from the resume banner, consumed by RunControls. */
export const resumeAction = writable<'resume' | 'discard' | null>(null);

/** Incremented to request a run start (Ctrl+Enter in the input). */
export const startRequest = writable<number>(0);

/**
 * Current filtered+sorted view of the results table, published by
 * ResultsTable for the Check-tab export menu (CSV/TSV/Markdown copy).
 * Empty when no results or ResultsTable is not mounted.
 */
export const exportRows = writable<ExportRow[]>([]);

/**
 * One-shot bridge: set to true by the watch banner's "Show favorites"
 * button; ResultsTable consumes it once (switches filter to 'favorites',
 * then resets the flag). Mirrors the exportRows bridging pattern.
 */
export const requestFavoritesView = writable<boolean>(false);

// ---- Results view persistence (SPEC §5 dh:v1:resultsview) ----

/** View fields restorable from a share link. nulls = absent (backward
 *  compatible with old links that carry only q/tlds/run). */
export interface SharedView {
  filter: 'all' | 'available' | 'taken' | 'problems' | null;
  sortKey: 'name' | 'price' | 'renew' | 'tco' | null;
  sortDir: 'asc' | 'desc' | null;
  query: string;
}

/** One-shot bridge: CheckTab stashes parsed share-link view fields here;
 *  ResultsTable consumes them once on mount, then clears the store. */
export const sharedView = writable<SharedView | null>(null);

/** Shape persisted to dh:v1:resultsview. */
export interface ResultsView {
  v: 1;
  filter: 'all' | 'available' | 'taken' | 'problems' | 'favorites';
  sortKey: 'name' | 'price' | 'renew' | 'tco' | 'status';
  sortDir: 'asc' | 'desc';
  budget: number;
  hideTraps: boolean;
  /** Renewal column semantics: 'best' = cheapest renewal across registrars;
   *  'paired' = renewal at the same registrar as the displayed first-year
   *  price. Defaults to 'best' for backward compatibility. */
  pairMode: 'best' | 'paired';
}

const RESULTS_VIEW_KEY = 'dh:v1:resultsview';

/** Read persisted results view from localStorage. Returns null on any
 *  parse/validation failure (never throws). */
export function loadResultsView(): ResultsView | null {
  try {
    const raw = localStorage.getItem(RESULTS_VIEW_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ResultsView>;
    if (parsed.v !== 1) return null;
    const filter = parsed.filter;
    const sortKey = parsed.sortKey;
    const sortDir = parsed.sortDir;
    const budget = typeof parsed.budget === 'number' ? parsed.budget : 0;
    const hideTraps = typeof parsed.hideTraps === 'boolean' ? parsed.hideTraps : false;
    const pairMode = parsed.pairMode === 'paired' ? 'paired' : 'best';
    if (
      filter !== 'all' && filter !== 'available' && filter !== 'taken' &&
      filter !== 'problems' && filter !== 'favorites'
    ) return null;
    if (
      sortKey !== 'name' && sortKey !== 'price' && sortKey !== 'renew' &&
      sortKey !== 'tco' && sortKey !== 'status'
    ) return null;
    if (sortDir !== 'asc' && sortDir !== 'desc') return null;
    return { v: 1, filter, sortKey, sortDir, budget, hideTraps, pairMode };
  } catch {
    return null;
  }
}

let resultsViewTimer: ReturnType<typeof setTimeout> | null = null;

/** Debounced (~300ms) write of the results view to localStorage. */
export function saveResultsView(view: ResultsView): void {
  if (resultsViewTimer != null) clearTimeout(resultsViewTimer);
  resultsViewTimer = setTimeout(() => {
    resultsViewTimer = null;
    try {
      localStorage.setItem(RESULTS_VIEW_KEY, JSON.stringify(view));
    } catch {
      // storage unavailable — non-fatal
    }
  }, 300);
}

// ---- Generator candidate tray (survives tab switches, persisted) ----

const GEN_TRAY_KEY = 'dh:v1:gentray';
/** Maximum candidates in the tray. Oldest entries are dropped on overflow. */
export const GEN_TRAY_CAP = 5000;

/** Pure: drop oldest entries (from the front) when the tray exceeds the cap. */
export function capGenTray<T>(list: T[], cap: number = GEN_TRAY_CAP): T[] {
  return list.length > cap ? list.slice(list.length - cap) : list;
}

function loadGenTray(): Candidate[] {
  try {
    const raw = localStorage.getItem(GEN_TRAY_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? capGenTray(parsed as Candidate[]) : [];
  } catch {
    return [];
  }
}

const _genCandidates = writable<Candidate[]>(loadGenTray());

/**
 * Capped gen-tray store: set/update automatically drop oldest entries beyond
 * GEN_TRAY_CAP so localStorage and memory stay bounded.
 */
export const genCandidates: typeof _genCandidates = {
  subscribe: _genCandidates.subscribe,
  set(value: Candidate[]): void {
    _genCandidates.set(capGenTray(value));
  },
  update(fn: (value: Candidate[]) => Candidate[]): void {
    _genCandidates.update((v) => capGenTray(fn(v)));
  },
};

let trayWriteTimer: ReturnType<typeof setTimeout> | null = null;
genCandidates.subscribe((value) => {
  if (trayWriteTimer != null) clearTimeout(trayWriteTimer);
  trayWriteTimer = setTimeout(() => {
    trayWriteTimer = null;
    try {
      localStorage.setItem(GEN_TRAY_KEY, JSON.stringify(value));
    } catch {
      // storage unavailable — non-fatal
    }
  }, 500);
});
