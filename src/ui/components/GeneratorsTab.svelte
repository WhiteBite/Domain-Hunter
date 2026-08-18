<script lang="ts">
  import { onDestroy } from 'svelte';
  import { get } from 'svelte/store';
  import { t } from '../../i18n';
  import { activeTab, checkInput, registry, pendingShareRun, genCandidates, selectedTlds } from '../store';
  import { KEYS, readJson, writeJson } from '../settings';
  import { combinator, type CombinatorMode } from '../../generators/combinator';
  import { mixSyllables } from '../../generators/syllables';
  import { findHacks } from '../../generators/hacks';
  import { mutate } from '../../generators/mutations';
  import { themes } from '../../generators/themes';

  const TRAY_MAX = 1000;
  const GEN_PREFS_KEY = 'dh:v1:genprefs';

  const DEFAULT_AFFIXES = [
    'app', 'pro', 'hq', 'hub', 'ai', 'io', 'get', 'use', 'my', 'go',
    'try', 'top', 'one', 'lab', 'kit', 'base', 'flow', 'forge', 'nest', 'peak',
  ];

  interface GenPrefs {
    keywords?: string;
    tech?: { combinator: boolean; mutations: boolean; hacks: boolean; syllables: boolean };
    affixes?: string;
    mode?: CombinatorMode;
    syllableCount?: number;
  }
  const savedPrefs = readJson<GenPrefs>(GEN_PREFS_KEY) ?? {};

  // idea
  let keywords = $state(savedPrefs.keywords ?? '');
  let tech = $state({
    combinator: savedPrefs.tech?.combinator ?? true,
    mutations: savedPrefs.tech?.mutations ?? true,
    hacks: savedPrefs.tech?.hacks ?? true,
    syllables: savedPrefs.tech?.syllables ?? true,
  });
  let affixes = $state(savedPrefs.affixes ?? DEFAULT_AFFIXES.join(', '));
  let mode = $state<CombinatorMode>(savedPrefs.mode ?? 'both');
  let syllableCount = $state(savedPrefs.syllableCount ?? 30);

  // combined candidate list — the single output of every technique
  type SrcId = 'combinator' | 'mutations' | 'hacks' | 'syllables' | 'themes' | 'sets';
  interface Cand {
    n: string;
    src: SrcId;
  }
  let candidates = $derived($genCandidates);
  let trayFilter = $state('');
  let traySort = $state<'added' | 'az'>('added');

  const GROUP_ORDER: SrcId[] = ['combinator', 'mutations', 'hacks', 'syllables', 'themes', 'sets'];
  const GROUP_LABEL: Record<SrcId, string> = {
    combinator: 'gen.combinator.title',
    mutations: 'gen.mutations.title',
    hacks: 'gen.hacks.title',
    syllables: 'gen.syllables.title',
    themes: 'gen.themes.title',
    sets: 'gen.themes.custom',
  };

  // themes browsing
  let activeThemeId = $state<string>('');

  // saved sets
  interface WordSet {
    id: string;
    name: string;
    words: string[];
  }
  let wordSets = $state<WordSet[]>(readJson<WordSet[]>(KEYS.wordsets) ?? []);
  let newSetName = $state('');
  let importError = $state('');

  let toast = $state('');
  let toastTimer: ReturnType<typeof setTimeout> | undefined;

  function showToast(message: string): void {
    toast = message;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toast = ''), 1800);
  }

  function splitList(text: string): string[] {
    return text
      .split(/[\s,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  function savePrefs(): void {
    writeJson(GEN_PREFS_KEY, { keywords, tech, affixes, mode, syllableCount });
  }

  function kws(): string[] {
    return keywords
      .split(/[\s,;]+/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
  }

  function addCandidates(names: string[], src: SrcId): void {
    if (names.length === 0) return;
    const merged = [...candidates];
    const have = new Set(merged.map((c) => c.n));
    let added = 0;
    for (const n of names) {
      if (have.has(n)) continue;
      if (merged.length >= TRAY_MAX) break;
      have.add(n);
      merged.push({ n, src });
      added += 1;
    }
    genCandidates.set(merged);
    showToast(t('gen.output.added', { n: added }));
  }

  function removeCandidate(name: string): void {
    genCandidates.update((list) => list.filter((w) => w.n !== name));
  }

  function hasCandidate(name: string): boolean {
    return candidates.some((c) => c.n === name);
  }

  const visibleCandidates = $derived.by(() => {
    const f = trayFilter.trim().toLowerCase();
    let list = f ? candidates.filter((c) => c.n.toLowerCase().includes(f)) : candidates;
    if (traySort === 'az') list = [...list].sort((a, b) => a.n.localeCompare(b.n));
    return list;
  });

  const candidateGroups = $derived.by(() => {
    const map = new Map<SrcId, Cand[]>();
    for (const c of visibleCandidates) {
      const arr = map.get(c.src) ?? [];
      arr.push(c);
      map.set(c.src, arr);
    }
    return GROUP_ORDER.filter((g) => map.has(g)).map((g) => ({ id: g, items: map.get(g) ?? [] }));
  });

  const TECH_CAP = 50;

  function generateAll(): void {
    const words = kws();
    if (tech.combinator && words.length > 0) {
      addCandidates(combinator(words, splitList(affixes), mode).slice(0, TECH_CAP), 'combinator');
    }
    if (tech.mutations && words.length > 0) {
      const muts: string[] = [];
      for (const w of words) muts.push(...mutate(w));
      addCandidates(muts.slice(0, TECH_CAP), 'mutations');
    }
    if (tech.hacks && words.length > 0) {
      addCandidates(
        findHacks(words, get(registry).hackTlds).map((f) => f.domain).slice(0, TECH_CAP),
        'hacks',
      );
    }
    if (tech.syllables) {
      const count = Math.max(1, Math.min(200, syllableCount || 30));
      addCandidates(mixSyllables({ count, seed: Date.now() }), 'syllables');
    }
    savePrefs();
  }

  // candidates actions
  function checkNow(): void {
    if (candidates.length === 0) return;
    checkInput.set(candidates.map((c) => c.n).join('\n'));
    // The Check tab auto-starts the run as soon as it mounts.
    pendingShareRun.set(true);
    activeTab.set('check');
  }

  function saveSet(): void {
    if (candidates.length === 0) return;
    const name = newSetName.trim() || `${t('gen.themes.newSet')} ${wordSets.length + 1}`;
    wordSets = [...wordSets, {
      id: typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2),
      name,
      words: candidates.map((c) => c.n),
    }];
    newSetName = '';
    writeJson(KEYS.wordsets, wordSets);
    showToast(t('settings.saved'));
  }

  function loadSet(set: WordSet): void {
    addCandidates(set.words, 'sets');
  }

  function deleteSet(id: string): void {
    wordSets = wordSets.filter((ws) => ws.id !== id);
    writeJson(KEYS.wordsets, wordSets);
  }

  function download(filename: string, content: string): void {
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportSets(): void {
    download('domain-hunter-wordsets.json', JSON.stringify(wordSets, null, 2));
  }

  async function importSets(file: File): Promise<void> {
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (!Array.isArray(parsed)) throw new Error('not an array');
      const map = new Map(wordSets.map((ws) => [ws.id, ws]));
      for (const item of parsed) {
        const ws = item as { id?: unknown; name?: unknown; words?: unknown };
        if (typeof ws.id === 'string' && typeof ws.name === 'string' && Array.isArray(ws.words)) {
          map.set(ws.id, {
            id: ws.id,
            name: ws.name,
            words: ws.words.filter((w): w is string => typeof w === 'string'),
          });
        }
      }
      wordSets = [...map.values()];
      writeJson(KEYS.wordsets, wordSets);
      importError = '';
    } catch {
      importError = t('settings.import.error');
    }
  }

  const activeTheme = $derived(themes.find((th) => th.id === activeThemeId) ?? null);

  const projectedChecks = $derived.by(() => {
    const zones = $selectedTlds.length;
    let n = 0;
    for (const c of candidates) n += c.n.includes('.') ? 1 : zones;
    return n;
  });

  const techToggles: { key: keyof typeof tech; labelKey: string }[] = [
    { key: 'combinator', labelKey: 'gen.combinator.title' },
    { key: 'mutations', labelKey: 'gen.mutations.title' },
    { key: 'hacks', labelKey: 'gen.hacks.title' },
    { key: 'syllables', labelKey: 'gen.syllables.title' },
  ];

  async function copyList(): Promise<void> {
    const text = candidates.map((c) => c.n).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      showToast(t('results.copied'));
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        showToast(t('results.copied'));
      } catch {
        // clipboard unavailable
      }
      document.body.removeChild(ta);
    }
  }

  onDestroy(() => clearTimeout(toastTimer));

  function sanitizeId(s: string): string {
    return s.replace(/[^a-zA-Z0-9]/g, '-');
  }
</script>

<section class="generators">
  <h2>{t('gen.title')}</h2>
  <p class="desc">{t('gen.idea.desc')}</p>

  <!-- Idea → generate -->
  <div class="card">
    <h3 class="card-title">{t('gen.idea.title')}</h3>
    <div class="idea-grid">
      <label class="grow">
        {t('gen.idea.keywords')}
        <input
          type="text"
          bind:value={keywords}
          placeholder={t('gen.idea.keywords.placeholder')}
          data-testid="gen-input-keywords"
          onkeydown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              generateAll();
            }
          }}
        />
      </label>
      <button class="btn primary big" type="button" onclick={generateAll} data-testid="gen-button-generate">
        {t('gen.generate.all')}
      </button>
    </div>

    <div class="techs" role="group" aria-label={t('gen.idea.techniques')}>
      {#each techToggles as toggle}
        <label class="tech" class:active={tech[toggle.key]}>
          <input type="checkbox" bind:checked={tech[toggle.key]} data-testid={`gen-toggle-${toggle.key}`} />
          <span>{t(toggle.labelKey)}</span>
        </label>
      {/each}
    </div>

    {#if kws().length === 0}
      <p class="hint-line">{t('gen.idea.hint')}</p>
    {/if}

    <details class="params">
      <summary data-testid="gen-summary-params">{t('gen.params')}</summary>
      <div class="params-body">
        <label>
          {t('gen.combinator.affixes')}
          <textarea rows="3" bind:value={affixes} data-testid="gen-textarea-affixes"></textarea>
        </label>
        <div class="params-row">
          <label class="inline">
            {t('gen.combinator.mode')}
            <select bind:value={mode} data-testid="gen-select-mode">
              <option value="prefix">{t('gen.combinator.mode.prefix')}</option>
              <option value="suffix">{t('gen.combinator.mode.suffix')}</option>
              <option value="both">{t('gen.combinator.mode.both')}</option>
            </select>
          </label>
          <label class="inline">
            {t('gen.syllables.count')}
            <input type="number" min="1" max="200" bind:value={syllableCount} data-testid="gen-input-syllable-count" />
          </label>
          <button
            class="btn ghost"
            type="button"
            onclick={() => (affixes = DEFAULT_AFFIXES.join(', '))}
            data-testid="gen-button-affixes-reset"
          >
            {t('gen.combinator.reset')}
          </button>
        </div>
      </div>
    </details>
  </div>

  <!-- Combined candidates -->
  <div class="card">
    <header class="tray-head">
      <h3>
        {t('gen.tray.title')}
        {#if candidates.length > 0}
          <span class="count-badge" aria-live="polite" data-testid="gen-tray-count">{candidates.length}</span>
        {/if}
      </h3>
      <div class="controls">
        <input
          class="filter"
          type="search"
          bind:value={trayFilter}
          placeholder={t('gen.tray.filter')}
          aria-label={t('gen.tray.filter')}
          data-testid="gen-input-tray-filter"
        />
        <select class="sort" bind:value={traySort} aria-label={t('gen.tray.sort')} data-testid="gen-select-tray-sort">
          <option value="added">{t('gen.tray.sort.added')}</option>
          <option value="az">{t('gen.tray.sort.az')}</option>
        </select>
        <button class="btn primary" type="button" onclick={checkNow} disabled={candidates.length === 0} data-testid="gen-button-check-now">
          {t('gen.output.check')}
        </button>
      </div>
    </header>
    <div class="controls">
      <input
        class="set-name"
        type="text"
        bind:value={newSetName}
        placeholder={t('gen.themes.newSet')}
        aria-label={t('gen.tray.save')}
        data-testid="gen-input-set-name"
      />
      <button class="btn" type="button" onclick={saveSet} disabled={candidates.length === 0} data-testid="gen-button-save-set">
        {t('gen.tray.save')}
      </button>
      <button
        class="btn ghost"
        type="button"
        onclick={() => genCandidates.set([])}
        disabled={candidates.length === 0}
        data-testid="gen-button-clear-tray"
      >
        {t('gen.tray.clear')}
      </button>
      <button
        class="btn"
        type="button"
        onclick={() => void copyList()}
        disabled={candidates.length === 0}
        data-testid="gen-button-copy-tray"
      >
        {t('gen.tray.copy')}
      </button>
    </div>
    {#if candidates.length > 0}
      <p class="muted projected" data-testid="gen-tray-projected">
        {t('gen.tray.projected', { n: projectedChecks, zones: $selectedTlds.length })}
      </p>
    {/if}
    {#if candidates.length === 0}
      <p class="muted" data-testid="gen-tray-empty">{t('gen.tray.empty')}</p>
    {:else}
      {#each candidateGroups as group (group.id)}
        <div class="group">
          <span class="group-label">{t(GROUP_LABEL[group.id])}</span>
          <div class="tray-words">
            {#each group.items as cand (cand.n)}
              <button
                class="tray-chip"
                type="button"
                title={t('gen.tray.remove')}
                onclick={() => removeCandidate(cand.n)}
                data-testid={`gen-tray-chip-${sanitizeId(cand.n)}`}
              >
                {cand.n}
                <span aria-hidden="true">×</span>
              </button>
            {/each}
          </div>
        </div>
      {/each}
    {/if}
  </div>

  <!-- Browse theme words -->
  <div class="card">
    <header>
      <h3>{t('gen.themes.title')}</h3>
      <p>{t('gen.themes.desc')}</p>
    </header>
    {#if themes.length === 0}
      <p class="muted">{t('gen.output.empty')}</p>
    {:else}
      <div class="chips">
        {#each themes as theme (theme.id)}
          <button
            class="chip cat"
            type="button"
            class:active={activeThemeId === theme.id}
            onclick={() => (activeThemeId = theme.id)}
            data-testid={`gen-theme-chip-${theme.id}`}
          >
            {t(theme.labelKey)}
          </button>
        {/each}
      </div>
      {#if activeTheme}
        <div class="words">
            {#each activeTheme.words as word (word.w)}
            <button
              class="word"
              type="button"
              class:selected={hasCandidate(word.w)}
              title={word.hint ?? ''}
              onclick={() =>
                hasCandidate(word.w) ? removeCandidate(word.w) : addCandidates([word.w], 'themes')}
              data-testid={`gen-theme-word-${sanitizeId(word.w)}`}
            >
              {word.w}
            </button>
          {/each}
        </div>
      {/if}
    {/if}
  </div>

  <!-- Saved sets -->
  <details class="card sets-card">
    <summary class="sets-summary" data-testid="gen-summary-sets">
      <span>{t('gen.themes.custom')}</span>
      <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
      <span class="controls" onclick={(e) => e.stopPropagation()} data-testid="gen-sets-controls">
        <button class="btn" type="button" onclick={exportSets} data-testid="gen-button-export-sets">{t('gen.themes.export')}</button>
        <label class="btn file-btn">
          {t('gen.themes.import')}
          <input
            type="file"
            accept="application/json,.json"
            hidden
            data-testid="gen-input-import-sets"
            onchange={(e) => {
              const file = e.currentTarget.files?.[0];
              if (file) void importSets(file);
              e.currentTarget.value = '';
            }}
          />
        </label>
      </span>
    </summary>
    {#if importError}
      <p class="error">{importError}</p>
    {/if}
    {#if wordSets.length === 0}
      <p class="muted">{t('gen.wordsets.empty')}</p>
    {:else}
      <ul class="set-list">
        {#each wordSets as set}
          <li class="set-row">
            <span class="set-name-label">{set.name}</span>
            <span class="muted">{t('gen.output.count', { n: set.words.length })}</span>
            <span class="row-actions">
              <button class="btn" type="button" onclick={() => loadSet(set)} data-testid={`gen-set-load-${sanitizeId(set.name)}`}>
                {t('gen.sets.load')}
              </button>
              <button class="btn danger" type="button" onclick={() => deleteSet(set.id)} data-testid={`gen-set-delete-${sanitizeId(set.name)}`}>
                {t('gen.themes.delete')}
              </button>
            </span>
          </li>
        {/each}
      </ul>
    {/if}
  </details>

  {#if toast}
    <div class="toast" role="status" data-testid="gen-toast">{toast}</div>
  {/if}
</section>

<style>
  .generators {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    max-width: 1120px;
  }

  h2 {
    margin: 0;
    font-size: var(--text-xl);
  }

  .desc {
    margin: 0;
    color: var(--text-secondary);
  }

  .card {
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding: var(--space-4);
    box-shadow: var(--shadow-sm);
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    min-width: 0;
  }

  .card header h3 {
    margin: 0;
    font-size: var(--text-base);
  }

  .card-title {
    margin: 0;
    font-size: var(--text-base);
  }

  .card header p {
    margin: var(--space-1) 0 0;
    color: var(--text-tertiary);
    font-size: var(--text-xs);
  }

  .idea-grid {
    display: flex;
    gap: var(--space-3);
    align-items: flex-end;
    flex-wrap: wrap;
  }

  .grow {
    flex: 1;
    min-width: 220px;
  }

  label {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    font-size: var(--text-sm);
    color: var(--text-secondary);
  }

  textarea,
  input[type='text'],
  input[type='search'],
  input[type='number'],
  select {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    padding: var(--space-2) var(--space-3);
    font-size: var(--text-sm);
    font-family: inherit;
    min-height: 40px;
  }

  textarea {
    resize: vertical;
    min-height: 72px;
    width: 100%;
  }

  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 40px;
    padding: 0 var(--space-4);
    border-radius: var(--radius-md);
    border: 1px solid var(--border);
    background: var(--bg);
    color: var(--text);
    font-size: var(--text-sm);
    cursor: pointer;
    transition: background var(--dur) var(--ease);
  }

  .btn:hover:not(:disabled) {
    background: var(--bg-sunken);
  }

  .btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .btn.primary {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--on-accent);
  }

  .btn.primary:hover:not(:disabled) {
    background: var(--accent-hover);
  }

  .btn.big {
    min-height: 44px;
    padding: 0 var(--space-5);
    font-weight: 500;
  }

  .btn.ghost {
    background: transparent;
  }

  .btn.danger {
    color: var(--red);
    border-color: color-mix(in srgb, var(--red) 40%, var(--border));
  }

  .file-btn {
    cursor: pointer;
  }

  .techs {
    display: flex;
    gap: var(--space-2);
    flex-wrap: wrap;
  }

  .tech {
    flex-direction: row;
    align-items: center;
    gap: var(--space-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-full);
    padding: var(--space-1) var(--space-3);
    min-height: 36px;
    font-size: var(--text-xs);
    color: var(--text-secondary);
    cursor: pointer;
    transition: background var(--dur) var(--ease), border-color var(--dur) var(--ease);
  }

  .tech input {
    accent-color: var(--accent);
    margin: 0;
  }

  .tech.active {
    background: var(--accent-soft);
    border-color: var(--accent);
    color: var(--accent);
  }

  .hint-line {
    margin: 0;
    color: var(--text-tertiary);
    font-size: var(--text-xs);
  }

  .params summary,
  .sets-summary {
    cursor: pointer;
    font-size: var(--text-sm);
    color: var(--text-secondary);
    user-select: none;
  }

  .params-body {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding-top: var(--space-3);
  }

  .params-row {
    display: flex;
    gap: var(--space-3);
    align-items: center;
    flex-wrap: wrap;
  }

  .inline {
    flex-direction: row;
    align-items: center;
    gap: var(--space-2);
  }

  .inline input,
  .inline select {
    max-width: 140px;
  }

  .tray-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    flex-wrap: wrap;
  }

  .tray-head h3 {
    margin: 0;
    font-size: var(--text-base);
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .count-badge {
    background: var(--accent-soft);
    color: var(--accent);
    border-radius: var(--radius-full);
    padding: 0 var(--space-2);
    font-size: var(--text-xs);
    font-weight: 600;
  }

  .controls {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-wrap: wrap;
  }

  .set-name {
    max-width: 180px;
  }

  .filter {
    max-width: 180px;
  }

  .sort {
    max-width: 150px;
  }

  .group {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .group-label {
    font-size: var(--text-xs);
    color: var(--text-tertiary);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .tray-words {
    display: flex;
    gap: var(--space-1);
    flex-wrap: wrap;
    max-height: 320px;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: var(--border-strong) transparent;
  }

  .tray-chip {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    border: 1px solid var(--border);
    background: var(--bg-sunken);
    color: var(--text);
    border-radius: var(--radius-sm);
    padding: var(--space-1) var(--space-2);
    font-size: var(--text-xs);
    font-family: var(--font-mono, ui-monospace, Consolas, monospace);
    cursor: pointer;
    transition: border-color var(--dur) var(--ease), color var(--dur) var(--ease);
  }

  .tray-chip:hover {
    border-color: var(--red);
    color: var(--red);
  }

  .chips {
    display: flex;
    gap: var(--space-2);
    flex-wrap: wrap;
  }

  .chip.cat {
    border: 1px solid var(--border);
    background: var(--bg);
    color: var(--text-secondary);
    border-radius: var(--radius-full);
    padding: var(--space-1) var(--space-3);
    min-height: 32px;
    font-size: var(--text-xs);
    cursor: pointer;
    transition: background var(--dur) var(--ease);
  }

  .chip.cat.active {
    background: var(--accent-soft);
    border-color: var(--accent);
    color: var(--accent);
  }

  .words {
    display: flex;
    gap: var(--space-1);
    flex-wrap: wrap;
    max-height: 240px;
    overflow-y: auto;
    padding: var(--space-1);
    scrollbar-width: thin;
    scrollbar-color: var(--border-strong) transparent;
  }

  .word {
    border: 1px solid var(--border);
    background: var(--bg);
    color: var(--text);
    border-radius: var(--radius-sm);
    padding: var(--space-1) var(--space-2);
    font-size: var(--text-xs);
    cursor: pointer;
    transition: background var(--dur) var(--ease), border-color var(--dur) var(--ease);
  }

  .word:hover {
    background: var(--bg-sunken);
  }

  .word.selected {
    background: var(--accent-soft);
    border-color: var(--accent);
    color: var(--accent);
  }

  .sets-card {
    gap: var(--space-3);
  }

  .sets-summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    flex-wrap: wrap;
    font-weight: 500;
    color: var(--text);
  }

  .set-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .set-row {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    flex-wrap: wrap;
  }

  .set-name-label {
    font-weight: 500;
  }

  .row-actions {
    display: flex;
    gap: var(--space-2);
    margin-left: auto;
  }

  .muted {
    color: var(--text-tertiary);
    font-size: var(--text-sm);
    margin: 0;
  }

  .projected {
    font-size: var(--text-xs);
  }

  .error {
    margin: 0;
    color: var(--red);
    font-size: var(--text-sm);
  }

  .toast {
    position: fixed;
    bottom: var(--space-5);
    left: 50%;
    transform: translateX(-50%);
    background: var(--bg-elevated);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: var(--radius-full);
    box-shadow: var(--shadow-lg);
    padding: var(--space-2) var(--space-5);
    font-size: var(--text-sm);
    z-index: 200;
  }
</style>
