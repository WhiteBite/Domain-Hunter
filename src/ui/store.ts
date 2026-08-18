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
export type TabId = 'check' | 'generators' | 'drops' | 'social' | 'settings' | 'about';
export const activeTab = writable<TabId>('check');

/** Set to true when a share link with run:true should auto-start the check. */
export const pendingShareRun = writable<boolean>(false);

/** Interrupted-run snapshot offered at the top of the Check tab. */
export const resumePrompt = writable<RunSnapshot | null>(null);

/** Decision from the resume banner, consumed by RunControls. */
export const resumeAction = writable<'resume' | 'discard' | null>(null);

/** Incremented to request a run start (Ctrl+Enter in the input). */
export const startRequest = writable<number>(0);

// ---- Generator candidate tray (survives tab switches, persisted) ----

const GEN_TRAY_KEY = 'dh:v1:gentray';

function loadGenTray(): Candidate[] {
  try {
    const raw = localStorage.getItem(GEN_TRAY_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as Candidate[]) : [];
  } catch {
    return [];
  }
}

export const genCandidates = writable<Candidate[]>(loadGenTray());
genCandidates.subscribe((value) => {
  try {
    localStorage.setItem(GEN_TRAY_KEY, JSON.stringify(value));
  } catch {
    // storage unavailable — non-fatal
  }
});
