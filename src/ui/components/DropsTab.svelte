<script lang="ts">
  import { get } from 'svelte/store';
  import { t } from '../../i18n';
  import { activeTab, checkInput, pendingShareRun } from '../store';
  import { favorites, toggleFavorite } from '../favorites';
  import { filterDrops, type DroppedDomain } from '../../core/dropped';
  import { copyText } from '../clipboard';
  import { createToast, sanitizeId } from '../utils';
  import Tooltip from './Tooltip.svelte';
  // Static snapshot shipped with the build (SPEC §17 — dropped-domains feed).
  import snapshot from '../../config/dropped.snapshot.json';

  interface Snapshot {
    generatedAt: string;
    source: string;
    /** Compact "label tld" strings (order-preserving, ~3× smaller than objects). */
    list: string[];
  }

  const data = snapshot as unknown as Snapshot;
  const allDomains: DroppedDomain[] = data.list.map((s) => {
    const i = s.lastIndexOf(' ');
    return { d: s.slice(0, i), tld: s.slice(i + 1) };
  });

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
  const toastCtl = createToast((m) => (toast = m));

  function showToast(message: string): void {
    toastCtl.show(message);
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
    const ok = await copyText(text);
    if (ok) showToast(t('results.copied'));
  }

  // Avoid stale timer across tab unmounts.
  $effect(() => {
    return () => toastCtl.destroy();
  });
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
    <span class="count nums" aria-live="polite">{t('drops.count', { n: filtered.length })}</span>
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
        {@const fullName = dom.d + '.' + dom.tld}
        {@const sid = sanitizeId(fullName)}
        <li class="row">
          <span class="domain" aria-label={fullName}>{dom.d}<span class="tld">.{dom.tld}</span></span>
          <span class="row-actions">
            <button
              class="icon-btn fav"
              class:active={$favorites.has(fullName)}
              type="button"
              onclick={() => { if (!toggleFavorite(fullName)) showToast(t('results.fav.full')); }}
              aria-label={$favorites.has(fullName) ? t('results.fav.remove') : t('results.fav.add')}
              title={$favorites.has(fullName) ? t('results.fav.remove') : t('results.fav.add')}
              data-testid={`drops-row-fav-${sid}`}
            >
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path
                  d="M8 2.5l1.7 3.6 3.9.5-2.9 2.7.8 3.9L8 11.3l-3.5 1.9.8-3.9-2.9-2.7 3.9-.5z"
                  fill={$favorites.has(fullName) ? 'currentColor' : 'none'}
                  stroke="currentColor"
                  stroke-width="1"
                  stroke-linejoin="round"
                />
              </svg>
            </button>
            <Tooltip text={t('drops.copy.aria', { domain: fullName })}>
              <button
                class="icon-btn"
                type="button"
                onclick={() => void copyDomain(dom)}
                aria-label={t('drops.copy.aria', { domain: fullName })}
                data-testid={`drops-row-copy-${sid}`}
              >
                <svg viewBox="0 0 16 16" aria-hidden="true"><rect x="4" y="4" width="9" height="9" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.5" /><path d="M3 11V3h8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" /></svg>
              </button>
            </Tooltip>
            <Tooltip text={t('drops.add.aria', { domain: fullName })}>
              <button
                class="icon-btn primary"
                type="button"
                onclick={() => addOne(dom)}
                aria-label={t('drops.add.aria', { domain: fullName })}
                data-testid={`drops-row-add-${sid}`}
              >
                <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3v10M3 8h10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" /></svg>
              </button>
            </Tooltip>
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

  .grid {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
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
    min-height: 40px;
  }

  .row:hover {
    background: var(--bg-sunken);
  }

  .domain {
    font-family: var(--font-mono, ui-monospace, Consolas, monospace);
    font-size: var(--text-sm);
    min-width: 0;
    word-break: break-all;
    overflow-wrap: anywhere;
    line-height: 1.3;
  }

  .tld {
    color: var(--text-tertiary);
  }

  .row-actions {
    display: flex;
    gap: var(--space-1);
    flex: none;
    align-items: center;
  }

  .icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border: 1px solid var(--border);
    background: var(--bg-elevated);
    color: var(--text-secondary);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: all var(--dur) var(--ease);
    padding: 0;
  }

  .icon-btn:hover {
    border-color: var(--border-strong);
    color: var(--text);
    background: var(--bg-sunken);
  }

  .icon-btn.fav.active {
    color: var(--accent);
    border-color: var(--accent);
    background: var(--accent-soft);
  }

  .icon-btn.primary {
    color: var(--accent);
    border-color: color-mix(in srgb, var(--accent) 30%, transparent);
    background: var(--accent-soft);
  }

  .icon-btn.primary:hover {
    color: var(--on-accent);
    background: var(--accent);
    border-color: var(--accent);
  }

  .icon-btn svg {
    width: 15px;
    height: 15px;
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
