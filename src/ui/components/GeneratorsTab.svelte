<script lang="ts">
  import { onDestroy } from 'svelte';
  import { get } from 'svelte/store';
  import { t } from '../../i18n';
  import { activeTab, checkInput, registry } from '../store';
  import { KEYS, readJson, writeJson } from '../settings';
  import { combinator, type CombinatorMode } from '../../generators/combinator';
  import { mixSyllables } from '../../generators/syllables';
  import { findHacks } from '../../generators/hacks';
  import { mutate } from '../../generators/mutations';
  import { themes } from '../../generators/themes';

  const TRAY_MAX = 1000;

  const DEFAULT_AFFIXES = [
    'app', 'pro', 'hq', 'hub', 'ai', 'io', 'get', 'use', 'my', 'go',
    'try', 'top', 'one', 'lab', 'kit', 'base', 'flow', 'forge', 'nest', 'peak',
  ];

  // inputs
  let roots = $state('');
  let affixes = $state(DEFAULT_AFFIXES.join('\n'));
  let mode = $state<CombinatorMode>('both');
  let syllableCount = $state(30);
  let activeThemeId = $state<string>('');
  let hackWords = $state('');
  let mutationWord = $state('');

  // shared candidate tray — every generator feeds here
  let tray = $state<string[]>([]);

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

  function lines(text: string): string[] {
    return text
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
  }

  function addToTray(names: string[]): void {
    if (names.length === 0) return;
    const merged = [...tray];
    let added = 0;
    for (const n of names) {
      if (merged.includes(n)) continue;
      if (merged.length >= TRAY_MAX) break;
      merged.push(n);
      added += 1;
    }
    tray = merged;
    showToast(t('gen.output.added', { n: added }));
  }

  function removeFromTray(name: string): void {
    tray = tray.filter((w) => w !== name);
  }

  function toggleWord(word: string): void {
    tray = tray.includes(word)
      ? tray.filter((w) => w !== word)
      : [...tray, word].slice(0, TRAY_MAX);
  }

  // generators → tray
  function generateCombinator(): void {
    addToTray(combinator(lines(roots), lines(affixes), mode));
  }

  function generateSyllables(): void {
    const count = Math.max(1, Math.min(200, syllableCount || 30));
    addToTray(mixSyllables({ count, seed: Date.now() }));
  }

  function generateHacks(): void {
    addToTray(findHacks(lines(hackWords), get(registry).hackTlds).map((f) => f.domain));
  }

  function generateMutations(): void {
    const word = mutationWord.trim();
    if (!word) return;
    addToTray(mutate(word));
  }

  // tray actions
  function checkNow(): void {
    if (tray.length === 0) return;
    checkInput.set(tray.join('\n'));
    activeTab.set('check');
  }

  function saveSet(): void {
    if (tray.length === 0) return;
    const name = newSetName.trim() || `${t('gen.themes.newSet')} ${wordSets.length + 1}`;
    wordSets = [...wordSets, { id: crypto.randomUUID(), name, words: [...tray] }];
    newSetName = '';
    writeJson(KEYS.wordsets, wordSets);
    showToast(t('settings.saved'));
  }

  function loadSet(set: WordSet): void {
    addToTray(set.words);
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

  onDestroy(() => clearTimeout(toastTimer));
</script>

<section class="generators">
  <h2>{t('gen.title')}</h2>
  <p class="desc">{t('gen.description')}</p>

  <div class="cards">
    <!-- Combinator -->
    <div class="card">
      <header>
        <h3>{t('gen.combinator.title')}</h3>
        <p>{t('gen.combinator.desc')}</p>
      </header>
      <div class="fields">
        <label>
          {t('gen.combinator.roots')}
          <textarea rows="3" bind:value={roots} placeholder="myapp&#10;orbit"></textarea>
        </label>
        <label>
          {t('gen.combinator.affixes')}
          <textarea rows="3" bind:value={affixes}></textarea>
        </label>
      </div>
      <div class="controls">
        <label class="inline">
          {t('gen.combinator.mode')}
          <select bind:value={mode}>
            <option value="prefix">{t('gen.combinator.mode.prefix')}</option>
            <option value="suffix">{t('gen.combinator.mode.suffix')}</option>
            <option value="both">{t('gen.combinator.mode.both')}</option>
          </select>
        </label>
        <button class="btn ghost" type="button" onclick={() => (affixes = DEFAULT_AFFIXES.join('\n'))}>
          {t('gen.combinator.reset')}
        </button>
        <button class="btn primary" type="button" onclick={generateCombinator}>
          {t('gen.generate')}
        </button>
      </div>
    </div>

    <!-- Syllable mixer -->
    <div class="card">
      <header>
        <h3>{t('gen.syllables.title')}</h3>
        <p>{t('gen.syllables.desc')}</p>
      </header>
      <div class="controls">
        <label class="inline">
          {t('gen.syllables.count')}
          <input type="number" min="1" max="200" bind:value={syllableCount} />
        </label>
        <button class="btn primary" type="button" onclick={generateSyllables}>
          {t('gen.generate')}
        </button>
      </div>
    </div>

    <!-- TLD hacks -->
    <div class="card">
      <header>
        <h3>{t('gen.hacks.title')}</h3>
        <p>{t('gen.hacks.desc')}</p>
      </header>
      <label>
        {t('gen.hacks.words')}
        <textarea rows="3" bind:value={hackWords} placeholder="family&#10;studio"></textarea>
      </label>
      <div class="controls">
        <button class="btn primary" type="button" onclick={generateHacks}>{t('gen.generate')}</button>
      </div>
    </div>

    <!-- Mutations -->
    <div class="card">
      <header>
        <h3>{t('gen.mutations.title')}</h3>
        <p>{t('gen.mutations.desc')}</p>
      </header>
      <div class="controls">
        <label class="inline grow">
          {t('gen.mutations.word')}
          <input type="text" bind:value={mutationWord} placeholder="midas" />
        </label>
        <button class="btn primary" type="button" onclick={generateMutations}>
          {t('gen.generate')}
        </button>
      </div>
    </div>

    <!-- Word themes -->
    <div class="card wide">
      <header>
        <h3>{t('gen.themes.title')}</h3>
        <p>{t('gen.themes.desc')}</p>
      </header>
      {#if themes.length === 0}
        <p class="muted">{t('gen.output.empty')}</p>
      {:else}
        <div class="chips">
          {#each themes as theme}
            <button
              class="chip cat"
              type="button"
              class:active={activeThemeId === theme.id}
              onclick={() => (activeThemeId = theme.id)}
            >
              {t(theme.labelKey)}
            </button>
          {/each}
        </div>
        {#if activeTheme}
          <div class="words">
            {#each activeTheme.words as word}
              <button
                class="word"
                type="button"
                class:selected={tray.includes(word.w)}
                title={word.hint ?? ''}
                onclick={() => toggleWord(word.w)}
              >
                {word.w}
              </button>
            {/each}
          </div>
        {/if}
      {/if}
    </div>
  </div>

  <!-- Shared candidate tray -->
  <div class="card tray">
    <header class="tray-head">
      <h3>
        {t('gen.tray.title')}
        {#if tray.length > 0}
          <span class="count-badge">{tray.length}</span>
        {/if}
      </h3>
      <div class="controls">
        <input
          class="set-name"
          type="text"
          bind:value={newSetName}
          placeholder={t('gen.themes.newSet')}
          aria-label={t('gen.tray.save')}
        />
        <button class="btn" type="button" onclick={saveSet} disabled={tray.length === 0}>
          {t('gen.tray.save')}
        </button>
        <button class="btn ghost" type="button" onclick={() => (tray = [])} disabled={tray.length === 0}>
          {t('gen.tray.clear')}
        </button>
        <button class="btn primary" type="button" onclick={checkNow} disabled={tray.length === 0}>
          {t('gen.output.check')}
        </button>
      </div>
    </header>
    {#if tray.length === 0}
      <p class="muted">{t('gen.tray.empty')}</p>
    {:else}
      <div class="tray-words">
        {#each tray as name}
          <button
            class="tray-chip"
            type="button"
            title={t('gen.tray.remove')}
            onclick={() => removeFromTray(name)}
          >
            {name}
            <span aria-hidden="true">×</span>
          </button>
        {/each}
      </div>
    {/if}
  </div>

  <!-- Saved sets -->
  <div class="card sets">
    <header class="tray-head">
      <h3>{t('gen.themes.custom')}</h3>
      <div class="controls">
        <button class="btn" type="button" onclick={exportSets}>{t('gen.themes.export')}</button>
        <label class="btn file-btn">
          {t('gen.themes.import')}
          <input
            type="file"
            accept="application/json,.json"
            hidden
            onchange={(e) => {
              const file = e.currentTarget.files?.[0];
              if (file) void importSets(file);
              e.currentTarget.value = '';
            }}
          />
        </label>
      </div>
    </header>
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
              <button class="btn" type="button" onclick={() => loadSet(set)}>{t('gen.sets.load')}</button>
              <button class="btn danger" type="button" onclick={() => deleteSet(set.id)}>
                {t('gen.themes.delete')}
              </button>
            </span>
          </li>
        {/each}
      </ul>
    {/if}
  </div>

  {#if toast}
    <div class="toast" role="status">{toast}</div>
  {/if}
</section>

<style>
  .generators {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  h2 {
    margin: 0;
    font-size: var(--text-xl);
  }

  .desc {
    margin: 0;
    color: var(--text-secondary);
  }

  .cards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
    gap: var(--space-3);
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

  .card.wide {
    grid-column: 1 / -1;
  }

  .card header h3 {
    margin: 0;
    font-size: var(--text-base);
  }

  .card header p {
    margin: var(--space-1) 0 0;
    color: var(--text-tertiary);
    font-size: var(--text-xs);
  }

  .fields {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-3);
  }

  .fields label {
    min-width: 0;
  }

  .fields textarea {
    width: 100%;
  }

  @media (max-width: 560px) {
    .fields {
      grid-template-columns: 1fr;
    }
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
  }

  .controls {
    display: flex;
    align-items: center;
    gap: var(--space-2);
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

  .grow {
    flex: 1;
    min-width: 160px;
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

  .set-name {
    max-width: 180px;
  }

  .tray-words {
    display: flex;
    gap: var(--space-1);
    flex-wrap: wrap;
    max-height: 280px;
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
