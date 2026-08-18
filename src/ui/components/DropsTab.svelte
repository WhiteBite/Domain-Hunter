<script lang="ts">
  import { get } from 'svelte/store';
  import { t } from '../../i18n';
  import { activeTab, checkInput, pendingShareRun } from '../store';
  import { favorites, toggleFavorite } from '../favorites';
  import { filterDrops, type DroppedDomain } from '../../core/dropped';
  // Static snapshot shipped with the build (SPEC §17 — dropped-domains feed).
  import snapshot from '../../config/dropped.snapshot.json';

  interface Snapshot {
    generatedAt: string;
    source: string;
    domains: { d: string; tld: string }[];
  }

  const data = snapshot as unknown as Snapshot;
  const allDomains: DroppedDomain[] = data.domains;

  // ---- TLD filter options: top 20 by count + 'all' ----
  const tldCounts = new Map<string, number>();
  for (const dom of allDomains) {
    tldCounts.set(dom.tld, (tldCounts.get(dom.tld) ?? 0) + 1);
  }
  const tldOptions = [...tldCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([tld, n]) => ({ tld, n }));

  // ---- UI state ----
  let query = $state('');
  let tldFilter = $state<string>(''); // '' = all

  const filtered = $derived(filterDrops(allDomains, query, tldFilter || null));
  const RENDER_CAP = 300;
  const visible = $derived(filtered.slice(0, RENDER_CAP));

  const snapshotDate = $derived(
    data.generatedAt ? new Date(data.generatedAt).toISOString().slice(0, 10) : '',
  );

  let toast = $state('');
  let toastTimer: ReturnType<typeof setTimeout> | undefined;

  function showToast(message: string): void {
    toast = message;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toast = ''), 1800);
  }

  function appendToCheck(domains: DroppedDomain[], cap: number): void {
    const lines = domains.slice(0, cap).map((d) => `${d.d}.${d.tld}`);
    if (lines.length === 0) return;
    const current = get(checkInput);
    const prefix = current && !current.endsWith('\n') ? current + '\n' : current;
    checkInput.set(prefix + lines.join('\n'));
  }

  function addOne(dom: DroppedDomain): void {
    appendToCheck([dom], 1);
    activeTab.set('check');
    // «To check» means check: auto-start the run like Generators' Check-now.
    pendingShareRun.set(true);
  }

  function addAll(): void {
    appendToCheck(filtered, 500);
    activeTab.set('check');
    pendingShareRun.set(true);
  }

  async function copyDomain(dom: DroppedDomain): Promise<void> {
    const text = `${dom.d}.${dom.tld}`;
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
        // clipboard unavailable — silent
      }
      document.body.removeChild(ta);
    }
  }

  // Avoid stale timer across tab unmounts.
  $effect(() => {
    return () => clearTimeout(toastTimer);
  });

  function sanitizeId(s: string): string {
    return s.replace(/[^a-zA-Z0-9]/g, '-');
  }
</script>

<section class="drops">
  <h2>{t('drops.title')}</h2>
  <p class="desc">{t('drops.desc')}</p>

  <div class="controls">
    <input
      class="search"
      type="search"
      bind:value={query}
      placeholder={t('drops.search')}
      aria-label={t('drops.search')}
      data-testid="drops-input-search"
    />
    <select bind:value={tldFilter} aria-label={t('drops.search')} data-testid="drops-select-tld">
      <option value="">{t('check.tlds.presets.all')}</option>
      {#each tldOptions as opt (opt.tld)}
        <option value={opt.tld}>.{opt.tld} ({opt.n})</option>
      {/each}
    </select>
    <span class="count" aria-live="polite">{t('drops.count', { n: filtered.length })}</span>
    <span class="snapshot">{t('drops.snapshot', { date: snapshotDate })}</span>
    <button
      class="btn primary"
      type="button"
      onclick={addAll}
      disabled={filtered.length === 0}
      data-testid="drops-button-add-all"
    >
      {t('drops.addAll')}
    </button>
  </div>

  {#if visible.length === 0}
    <p class="muted empty">{t('drops.empty')}</p>
  {:else}
    <ul class="grid" role="list">
      {#each visible as dom (dom.d + '.' + dom.tld)}
        <li class="row">
          <span class="domain" aria-label={dom.d + '.' + dom.tld}>{dom.d}<span class="tld">.{dom.tld}</span></span>
          <span class="row-actions">
            <button
              class="btn ghost sm fav"
              class:active={$favorites.has(dom.d + '.' + dom.tld)}
              type="button"
              onclick={() => toggleFavorite(dom.d + '.' + dom.tld)}
              aria-label={$favorites.has(dom.d + '.' + dom.tld) ? t('results.fav.remove') : t('results.fav.add')}
              title={$favorites.has(dom.d + '.' + dom.tld) ? t('results.fav.remove') : t('results.fav.add')}
              data-testid={`drops-row-fav-${sanitizeId(dom.d + '.' + dom.tld)}`}
            >
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path
                  d="M8 2.5l1.7 3.6 3.9.5-2.9 2.7.8 3.9L8 11.3l-3.5 1.9.8-3.9-2.9-2.7 3.9-.5z"
                  fill={$favorites.has(dom.d + '.' + dom.tld) ? 'currentColor' : 'none'}
                  stroke="currentColor"
                  stroke-width="1"
                  stroke-linejoin="round"
                />
              </svg>
            </button>
            <button class="btn ghost sm" type="button" onclick={() => copyDomain(dom)} data-testid={`drops-row-copy-${sanitizeId(dom.d + '.' + dom.tld)}`}>
              {t('results.copy')}
            </button>
            <button class="btn sm" type="button" onclick={() => addOne(dom)} data-testid={`drops-row-add-${sanitizeId(dom.d + '.' + dom.tld)}`}>
              {t('drops.add')}
            </button>
          </span>
        </li>
      {/each}
    </ul>
    {#if filtered.length > visible.length}
      <p class="muted more">
        {t('results.showing', { shown: visible.length, total: filtered.length })}
      </p>
    {/if}
  {/if}

  {#if toast}
    <div class="toast" role="status">{toast}</div>
  {/if}
</section>

<style>
  .drops {
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

  .controls {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-wrap: wrap;
  }

  .search {
    flex: 1;
    min-width: 200px;
    max-width: 320px;
  }

  .search,
  select {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    padding: var(--space-2) var(--space-3);
    font-size: var(--text-sm);
    font-family: inherit;
    min-height: 40px;
  }

  .count {
    color: var(--text-secondary);
    font-size: var(--text-sm);
  }

  .snapshot {
    color: var(--text-tertiary);
    font-size: var(--text-xs);
    margin-left: auto;
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

  .btn.sm {
    min-height: 32px;
    padding: 0 var(--space-3);
    font-size: var(--text-xs);
  }

  .btn.fav.active {
    color: var(--accent);
  }

  .btn.fav svg {
    width: 15px;
    height: 15px;
  }

  .grid {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: var(--space-1);
  }

  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    padding: var(--space-1) var(--space-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg-elevated);
    min-width: 0;
  }

  .row:hover {
    background: var(--bg-sunken);
  }

  .domain {
    font-family: var(--font-mono, ui-monospace, Consolas, monospace);
    font-size: var(--text-sm);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }

  .tld {
    color: var(--text-tertiary);
  }

  .row-actions {
    display: flex;
    gap: var(--space-1);
    flex: none;
  }

  .muted {
    color: var(--text-tertiary);
    font-size: var(--text-sm);
    margin: 0;
  }

  .empty {
    padding: var(--space-5) 0;
    text-align: center;
  }

  .more {
    text-align: center;
    padding-top: var(--space-2);
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

  @media (max-width: 640px) {
    .snapshot {
      margin-left: 0;
      width: 100%;
    }
  }
</style>
