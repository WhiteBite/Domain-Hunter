/**
 * Domain projects / portfolios (SPEC §5 dh:v1:projects): named groups of
 * domains with a note, a color and per-project CSV/JSON export. Store-based
 * composable — same pattern as favorites.ts.
 */
import { writable } from 'svelte/store';
import { readJson, writeJson } from './settings';
import { toSimpleCsv } from './csv';
import { downloadText } from './utils';

const KEY = 'dh:v1:projects';
export const MAX_PROJECTS = 50;
export const MAX_PROJECT_DOMAINS = 2000;
const WRITE_DEBOUNCE_MS = 300;

export interface Project {
  id: string;
  name: string;
  /** Palette index (kept modulo PROJECT_COLORS on render). */
  color: number;
  note: string;
  domains: string[];
}

export const PROJECT_COLORS = [
  '#5e6ad2',
  '#2fbf71',
  '#f0704a',
  '#e0b13a',
  '#d64fa8',
  '#3aa3c9',
  '#8a6fd4',
  '#747a86',
];

function isProject(x: unknown): x is Project {
  if (x == null || typeof x !== 'object') return false;
  const p = x as Record<string, unknown>;
  return (
    typeof p.id === 'string' &&
    typeof p.name === 'string' &&
    typeof p.color === 'number' &&
    typeof p.note === 'string' &&
    Array.isArray(p.domains) &&
    p.domains.every((d) => typeof d === 'string')
  );
}

function load(): Project[] {
  const parsed = readJson<unknown>(KEY);
  return Array.isArray(parsed) ? parsed.filter(isProject) : [];
}

export const projects = writable<Project[]>(load());

let timer: ReturnType<typeof setTimeout> | null = null;
projects.subscribe((value) => {
  if (timer != null) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    writeJson(KEY, value);
  }, WRITE_DEBOUNCE_MS);
});

/** Pure: split free-form text into a deduped lowercase domain list. */
export function parseDomainList(text: string, cap: number = MAX_PROJECT_DOMAINS): string[] {
  const out: string[] = [];
  for (const raw of text.split(/[\s,]+/)) {
    const d = raw.trim().toLowerCase();
    if (d === '' || !d.includes('.') || out.includes(d)) continue;
    out.push(d);
    if (out.length >= cap) break;
  }
  return out;
}

export function addProject(name: string): Project | null {
  let created: Project | null = null;
  projects.update((list) => {
    const clean = name.trim();
    if (clean === '' || list.length >= MAX_PROJECTS) return list;
    created = {
      id: `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      name: clean,
      color: list.length % PROJECT_COLORS.length,
      note: '',
      domains: [],
    };
    return [...list, created];
  });
  return created;
}

export function removeProject(id: string): void {
  projects.update((list) => list.filter((p) => p.id !== id));
}

export function patchProject(
  id: string,
  patch: Partial<Pick<Project, 'name' | 'note'>>,
): void {
  projects.update((list) => list.map((p) => (p.id === id ? { ...p, ...patch } : p)));
}

/** Replace a project's domains with the parsed form of free-form text. */
export function setProjectDomains(id: string, text: string): void {
  const domains = parseDomainList(text);
  projects.update((list) => list.map((p) => (p.id === id ? { ...p, domains } : p)));
}

export function projectCsv(p: Project): string {
  return toSimpleCsv(
    p.domains.map((d) => [d, p.name]),
    ['domain', 'project'],
  );
}

export function projectJson(p: Project): string {
  return JSON.stringify(p, null, 2);
}

function fileSlug(p: Project): string {
  return p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'project';
}

export function exportProjectCsv(p: Project): void {
  downloadText(`domain-hunter-project-${fileSlug(p)}.csv`, projectCsv(p), 'text/csv');
}

export function exportProjectJson(p: Project): void {
  downloadText(
    `domain-hunter-project-${fileSlug(p)}.json`,
    projectJson(p),
    'application/json',
  );
}
