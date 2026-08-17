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
  import Tooltip from './Tooltip.svelte';

  type GenId = 'combinator' | 'syllables' | 'themes' | 'hacks' | 'mutations' | 'wordsets';
  let activeGen = $state<GenId>('combinator');

  const DEFAULT_AFFIXES = [
    'app', 'pro', 'hq', 'hub', 'ai', 'io', 'get', 'use', 'my', 'go',
    'try', 'top', 'one', 'lab', 'kit', 'base', 'flow', 'forge', 'nest', 'peak',
  ];

  // combinator
  let roots = $state('');
  let affixes = $state(DEFAULT_AFFIXES.join('\n'));
  let mode = $state<CombinatorMode>('both');

  // syllables
  let syllableCount = $state(30);

  // themes
  let activeThemeId = $state<string>('');
  let tray = $state<string[]>([]);

  // hacks / mutations
  let hackWords = $state('');
  let mutationWord = $state('');

  // word sets
  interface WordSet {
    id: string;
    name: string;
    words: string[];
  }
  let wordSets = $state<WordSet[]>(readJson<WordSet[]>(KEYS.wordsets) ?? []);
  let newSetName = $state('');
  let importError = $state('');

  interface OutputState {
    labels: string[];
    names: string[];
  }
  let outputs = $state<Record<string, OutputState>>({
    combinator: { labels: [], names: [] },
    syllables: { labels: [], names: [] },
    hacks: { labels: [], names: [] },
    mutations: { labels: [], names: [] },
  });

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

  function setOutput(gen: string, labels: string[], names: string[]): void {
    outputs[gen] = { labels: labels.slice(0, 500), names: names.slice(0, 500) };
  }

  function generateCombinator(): void {
    const names = combinator(lines(roots), lines(affixes), mode);
    setOutput('combinator', names, names);
  }

  function generateSyllables(): void {
    const count = Math.max(1, Math.min(200, syllableCount || 30));
    const names = mixSyllables({ count, seed: Date.now() });
    setOutput('syllables', names, names);
  }

  function generateHacks(wordsOverride?: string[]): void {
    const words = wordsOverride ?? lines(hackWords);
    const found = findHacks(words, get(registry).hackTlds);
    setOutput(
      'hacks',
      found.map((f) => f.domain.replace(`.${f.tld}`, `·${f.tld}`)),
      found.map((f) => f.domain),
    );
  }

  function generateMutations(wordsOverride?: string[]): void {
    const words = wordsOverride ?? (mutationWord.trim() ? [mutationWord.trim()] : []);
    const all: string[] = [];
    for (const w of words) all.push(...mutate(w));
    const names = [...new Set(all)];
    setOutput('mutations', names, names);
  }

  function checkNow(names: string[]): void {
    if (names.length === 0) return;
    checkInput.set(names.join('\n'));
    activeTab.set('check');
  }

  function addToCheck(names: string[]): void {
    if (names.length === 0) return;
    const existing = get(checkInput);
    checkInput.set(existing ? `${existing}\n${names.join('\n')}` : names.join('\n'));
    showToast(t('gen.output.added', { n: names.length }));
  }

  const activeTheme = $derived(themes.find((th) => th.id === activeThemeId) ?? null);

  function toggleTray(word: string): void {
    tray = tray.includes(word) ? tray.filter((w) => w !== word) : [...tray, word];
  }

  function trayToCombinator(): void {
    roots = tray.join('\n');
    activeGen = 'combinator';
  }

  function trayToHacks(): void {
    hackWords = tray.join('\n');
    activeGen = 'hacks';
    generateHacks(tray);
  }

  function trayToMutations(): void {
    mutationWord = tray[0] ?? '';
    activeGen = 'mutations';
    generateMutations(tray);
  }

  function saveWordSets(): void {
    writeJson(KEYS.wordsets, wordSets);
  }

  function createSetFromTray(): void {
    if (tray.length === 0) return;
    const name = newSetName.trim() || `${t('gen.themes.newSet')} ${wordSets.length + 1}`;
    wordSets = [...wordSets, { id: crypto.randomUUID(), name, words: [...tray] }];
    newSetName = '';
    saveWordSets();
  }

  function deleteSet(id: string): void {
    wordSets = wordSets.filter((ws) => ws.id !== id);
    saveWordSets();
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
      saveWordSets();
      importError = '';
    } catch {
      importError = t('settings.import.error');
    }
  }

  const navItems: { id: GenId; labelKey: string }[] = [
    { id: 'combinator', labelKey: 'gen.combinator.title' },
    { id: 'syllables', labelKey: 'gen.syllables.title' },
    { id: 'themes', labelKey: 'gen.themes.title' },
    { id: 'hacks', labelKey: 'gen.hacks.title' },
    { id: 'mutations', labelKey: 'gen.mutations.title' },
    { id: 'wordsets', labelKey: 'gen.themes.custom' },
  ];

  onDestroy(() => clearTimeout(toastTimer));
</script>

<section class="generators">
  <h2>{t('gen.title')}</h2>
  <p class="desc">{t('gen.description')}</p>

  <nav class="pills" aria-label={t('gen.title')}>
    {#each navItems as item}
      <button
        class="pill"
        class:active={activeGen === item.id}
        aria-pressed={activeGen === item.id}
        onclick={() => (activeGen = item.id)}
      >
        {t(item.labelKey)}
      </button>
    {/each}
  </nav>

  {#if activeGen === 'combinator'}
    {@const out = outputs['combinator']}
    <div class="card">
      <h3>{t('gen.combinator.title')}</h3>
      <p class="panel-desc">{t('gen.combinator.desc')}</p>
      <div class="grid">
        <label>
          {t('gen.combinator.roots')}
          <textarea rows="5" bind:value={roots} placeholder="myapp&#10;orbit"></textarea>
        </label>
        <label>
          {t('gen.combinator.affixes')}
          <textarea rows="5" bind:value={affixes}></textarea>
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
        <button class="btn ghost" onclick={() => (affixes = DEFAULT_AFFIXES.join('\n'))}>
          {t('gen.combinator.presets')}
        </button>
        <button class="btn primary" onclick={generateCombinator}>{t('gen.generate')}</button>
      </div>
      {#if out && out.labels.length > 0}
        <div class="output">
          <div class="output-head">
            <span>{t('gen.output.count', { n: out.labels.length })}</span>
            <span class="output-actions">
              <button class="btn primary" onclick={() => checkNow(out.names)}>
                {t('gen.output.check')}
              </button>
              <button class="btn" onclick={() => addToCheck(out.names)}>{t('gen.output.add')}</button>
            </span>
          </div>
          <ul class="output-list">
            {#each out.labels as label}
              <li>{label}</li>
            {/each}
          </ul>
        </div>
      {:else}
        <p class="muted">{t('gen.output.empty')}</p>
      {/if}
    </div>
  {:else if activeGen === 'syllables'}
    {@const out = outputs['syllables']}
    <div class="card">
      <h3>{t('gen.syllables.title')}</h3>
      <p class="panel-desc">{t('gen.syllables.desc')}</p>
      <div class="controls">
        <label class="inline">
          {t('gen.syllables.count')}
          <input type="number" min="1" max="200" bind:value={syllableCount} />
        </label>
        <button class="btn primary" onclick={generateSyllables}>{t('gen.generate')}</button>
      </div>
      {#if out && out.labels.length > 0}
        <div class="output">
          <div class="output-head">
            <span>{t('gen.output.count', { n: out.labels.length })}</span>
            <span class="output-actions">
              <button class="btn primary" onclick={() => checkNow(out.names)}>
                {t('gen.output.check')}
              </button>
              <button class="btn" onclick={() => addToCheck(out.names)}>{t('gen.output.add')}</button>
            </span>
          </div>
          <ul class="output-list">
            {#each out.labels as label}
              <li>{label}</li>
            {/each}
          </ul>
        </div>
      {:else}
        <p class="muted">{t('gen.output.empty')}</p>
      {/if}
    </div>
  {:else if activeGen === 'themes'}
    <div class="card">
      <h3>{t('gen.themes.title')}</h3>
      <p class="panel-desc">{t('gen.themes.desc')}</p>
      {#if themes.length === 0}
        <p class="muted">{t('gen.output.empty')}</p>
      {:else}
        <div class="chips">
          {#each themes as theme}
            <button
              class="chip"
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
                class:selected={tray.includes(word.w)}
                title={word.hint ?? ''}
                onclick={() => toggleTray(word.w)}
              >
                {word.w}
              </button>
            {/each}
          </div>
        {/if}
        <div class="tray">
          <h4>
            <Tooltip text={t('gen.themes.desc')}>
              <span>{t('gen.themes.custom')}</span>
            </Tooltip>
          </h4>
          {#if tray.length === 0}
            <p class="muted">{t('gen.themes.trayEmpty')}</p>
          {:else}
            <div class="words">
              {#each tray as word}
                <button class="word selected" onclick={() => toggleTray(word)}>{word}</button>
              {/each}
            </div>
            <div class="controls">
              <button class="btn" onclick={trayToCombinator}>{t('gen.combinator.title')}</button>
              <button class="btn" onclick={trayToHacks}>{t('gen.hacks.title')}</button>
              <button class="btn" onclick={trayToMutations}>{t('gen.mutations.title')}</button>
              <button class="btn primary" onclick={() => checkNow(tray)}>{t('gen.output.check')}</button>
              <button class="btn" onclick={() => addToCheck(tray)}>{t('gen.output.add')}</button>
            </div>
            <div class="controls">
              <input
                type="text"
                bind:value={newSetName}
                placeholder={t('gen.themes.newSet')}
                aria-label={t('gen.themes.newSet')}
              />
              <button class="btn" onclick={createSetFromTray}>{t('gen.themes.newSet')}</button>
            </div>
          {/if}
        </div>
      {/if}
    </div>
  {:else if activeGen === 'hacks'}
    {@const out = outputs['hacks']}
    <div class="card">
      <h3>{t('gen.hacks.title')}</h3>
      <p class="panel-desc">{t('gen.hacks.desc')}</p>
      <label>
        {t('gen.hacks.words')}
        <textarea rows="5" bind:value={hackWords} placeholder="family&#10;studio"></textarea>
      </label>
      <div class="controls">
        <button class="btn primary" onclick={() => generateHacks()}>{t('gen.generate')}</button>
      </div>
      {#if out && out.labels.length > 0}
        <div class="output">
          <div class="output-head">
            <span>{t('gen.output.count', { n: out.labels.length })}</span>
            <span class="output-actions">
              <button class="btn primary" onclick={() => checkNow(out.names)}>
                {t('gen.output.check')}
              </button>
              <button class="btn" onclick={() => addToCheck(out.names)}>{t('gen.output.add')}</button>
            </span>
          </div>
          <ul class="output-list">
            {#each out.labels as label}
              <li>{label}</li>
            {/each}
          </ul>
        </div>
      {:else}
        <p class="muted">{t('gen.output.empty')}</p>
      {/if}
    </div>
  {:else if activeGen === 'mutations'}
    {@const out = outputs['mutations']}
    <div class="card">
      <h3>{t('gen.mutations.title')}</h3>
      <p class="panel-desc">{t('gen.mutations.desc')}</p>
      <div class="controls">
        <label class="inline grow">
          {t('gen.mutations.word')}
          <input type="text" bind:value={mutationWord} placeholder="midas" />
        </label>
        <button class="btn primary" onclick={() => generateMutations()}>{t('gen.generate')}</button>
      </div>
      {#if out && out.labels.length > 0}
        <div class="output">
          <div class="output-head">
            <span>{t('gen.output.count', { n: out.labels.length })}</span>
            <span class="output-actions">
              <button class="btn primary" onclick={() => checkNow(out.names)}>
                {t('gen.output.check')}
              </button>
              <button class="btn" onclick={() => addToCheck(out.names)}>{t('gen.output.add')}</button>
            </span>
          </div>
          <ul class="output-list">
            {#each out.labels as label}
              <li>{label}</li>
            {/each}
          </ul>
        </div>
      {:else}
        <p class="muted">{t('gen.output.empty')}</p>
      {/if}
    </div>
  {:else}
    <div class="card">
      <h3>{t('gen.themes.custom')}</h3>
      {#if wordSets.length === 0}
        <p class="muted">{t('gen.wordsets.empty')}</p>
      {:else}
        <ul class="set-list">
          {#each wordSets as set}
            <li class="set-row">
              <span class="set-name">{set.name}</span>
              <span class="muted">{t('gen.output.count', { n: set.words.length })}</span>
              <span class="row-actions">
                <button class="btn" onclick={() => addToCheck(set.words)}>{t('gen.output.add')}</button>
                <button class="btn danger" onclick={() => deleteSet(set.id)}>
                  {t('gen.themes.delete')}
                </button>
              </span>
            </li>
          {/each}
        </ul>
      {/if}
      <div class="controls">
        <button class="btn" onclick={exportSets}>{t('gen.themes.export')}</button>
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
      {#if importError}
        <p class="error">{importError}</p>
      {/if}
    </div>
  {/if}

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

  .pills {
    display: flex;
    gap: var(--space-2);
    flex-wrap: wrap;
  }

  .pill {
    border: 1px solid var(--border);
    background: var(--bg-elevated);
    color: var(--text-secondary);
    border-radius: var(--radius-full);
    padding: var(--space-2) var(--space-4);
    min-height: 40px;
    font-size: var(--text-sm);
    cursor: pointer;
    transition: background var(--dur) var(--ease), color var(--dur) var(--ease);
  }

  .pill:hover {
    background: var(--bg-sunken);
  }

  .pill.active {
    background: var(--accent-soft);
    border-color: var(--accent);
    color: var(--accent);
    font-weight: 500;
  }

  .card {
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding: var(--space-4) var(--space-5);
    box-shadow: var(--shadow-sm);
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .card h3 {
    margin: 0;
    font-size: var(--text-base);
  }

  .card h4 {
    margin: 0;
    font-size: var(--text-sm);
  }

  .panel-desc {
    margin: 0;
    color: var(--text-tertiary);
    font-size: var(--text-sm);
  }

  .grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-3);
  }

  @media (max-width: 640px) {
    .grid {
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
    min-height: 96px;
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
    min-width: 200px;
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

  .btn:hover {
    background: var(--bg-sunken);
  }

  .btn.primary {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--on-accent);
  }

  .btn.primary:hover {
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

  .chip {
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

  .chip.active {
    background: var(--accent-soft);
    border-color: var(--accent);
    color: var(--accent);
  }

  .words {
    display: flex;
    gap: var(--space-1);
    flex-wrap: wrap;
    max-height: 260px;
    overflow-y: auto;
    padding: var(--space-1);
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

  .tray {
    border-top: 1px solid var(--border);
    padding-top: var(--space-3);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .output {
    border-top: 1px solid var(--border);
    padding-top: var(--space-3);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .output-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    flex-wrap: wrap;
    font-size: var(--text-sm);
    color: var(--text-secondary);
  }

  .output-actions {
    display: flex;
    gap: var(--space-2);
  }

  .output-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: var(--space-1);
    max-height: 320px;
    overflow-y: auto;
  }

  .output-list li {
    font-family: var(--font-mono, ui-monospace, 'Cascadia Code', Consolas, monospace);
    font-size: var(--text-xs);
    background: var(--bg-sunken);
    border-radius: var(--radius-sm);
    padding: var(--space-1) var(--space-2);
    overflow-wrap: anywhere;
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

  .set-name {
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
