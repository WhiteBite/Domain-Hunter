<script lang="ts">
  import { onMount } from 'svelte';
  import { registry, selectedTlds, settings, pricing } from '../store';
  import { bestEntry, formatPrice, tco3 } from '../../pricing/pricing';
  import { t } from '../../i18n';
  import { get } from 'svelte/store';

  type Preset = 'popular' | 'cheapest' | 'all';

  let search = $state('');
  let activePreset = $state<Preset | null>(null);
  let health = $state<Record<string, { ok?: boolean }>>({});

  onMount(() => {
    // Zone health snapshot from the weekly CI job (present on Pages only).
    fetch('./health.json')
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (json && typeof json === 'object' && (json as { tlds?: unknown }).tlds) {
          health = (json as { tlds: Record<string, { ok?: boolean }> }).tlds;
        }
      })
      .catch(() => {});
  });

  function isUnstable(tld: string): boolean {
    const h = health[tld];
    return h != null && h.ok === false;
  }

  const allTlds = $derived($registry.tlds);

  const cheapestTlds = $derived.by(() => {
    const table = $pricing?.table;
    if (!table) return [];
    const arr = allTlds
      .map((c) => ({ tld: c.tld, tco: tco3(table, c.tld) }))
      .filter((x) => x.tco != null) as { tld: string; tco: number }[];
    arr.sort((a, b) => a.tco - b.tco);
    return arr.slice(0, 15).map((x) => x.tld);
  });

  const filtered = $derived.by(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allTlds;
    return allTlds.filter((c) => c.tld.includes(q));
  });

  const visibleTlds = $derived.by(() => {
    if (activePreset === 'popular') {
      const defaults = get(settings).defaultTlds;
      return allTlds.filter((c) => defaults.includes(c.tld));
    }
    if (activePreset === 'cheapest') {
      return allTlds.filter((c) => cheapestTlds.includes(c.tld));
    }
    return filtered;
  });

  function toggle(tld: string) {
    const current = get(selectedTlds);
    if (current.includes(tld)) {
      selectedTlds.set(current.filter((t) => t !== tld));
    } else {
      selectedTlds.set([...current, tld]);
    }
  }

  function applyPreset(p: Preset) {
    activePreset = activePreset === p ? null : p;
    if (activePreset === 'popular') {
      selectedTlds.set([...get(settings).defaultTlds]);
    } else if (activePreset === 'cheapest') {
      selectedTlds.set([...cheapestTlds]);
    } else if (activePreset === 'all') {
      selectedTlds.set(allTlds.map((c) => c.tld));
    }
  }

  function chipPrice(tld: string): string | null {
    const table = $pricing?.table;
    if (!table) return null;
    const best = bestEntry(table, tld);
    if (!best || best.entry.reg == null) return null;
    return formatPrice(best.entry.reg, get(settings));
  }

  function chipFlags(tld: string) {
    const cfg = allTlds.find((c) => c.tld === tld);
    return cfg?.flags ?? null;
  }

  function isSelected(tld: string): boolean {
    return get(selectedTlds).includes(tld);
  }
</script>

<div class="tld-picker">
  <div class="controls">
    <input
      class="search"
      type="search"
      placeholder={t('check.tlds.search')}
      bind:value={search}
      aria-label={t('check.tlds.search')}
    />
    <div class="presets" role="group" aria-label={t('check.tlds.title')}>
      <button
        class="preset"
        class:active={activePreset === 'popular'}
        onclick={() => applyPreset('popular')}
        type="button"
      >
        {t('check.tlds.presets.popular')}
      </button>
      <button
        class="preset"
        class:active={activePreset === 'cheapest'}
        onclick={() => applyPreset('cheapest')}
        type="button"
      >
        {t('check.tlds.presets.cheapest')}
      </button>
      <button
        class="preset"
        class:active={activePreset === 'all'}
        onclick={() => applyPreset('all')}
        type="button"
      >
        {t('check.tlds.presets.all')}
      </button>
    </div>
  </div>

  <div class="chips" role="listbox" aria-label={t('check.tlds.title')}>
    {#each visibleTlds as cfg (cfg.tld)}
      {@const price = chipPrice(cfg.tld)}
      {@const flags = chipFlags(cfg.tld)}
      {@const selected = isSelected(cfg.tld)}
      <button
        class="chip"
        class:selected
        role="option"
        aria-selected={selected}
        onclick={() => toggle(cfg.tld)}
        type="button"
        title={
          flags?.reputationNote
            ? t('check.tlds.spamNote')
            : isUnstable(cfg.tld)
              ? t('check.tlds.unstable')
              : undefined
        }
      >
        <span class="tld">.{cfg.tld}</span>
        {#if isUnstable(cfg.tld)}
          <span class="dot-unstable" aria-hidden="true"></span>
        {/if}
        {#if price}
          <span class="price">{price}</span>
        {/if}
        {#if flags?.experimental}
          <span class="flag experimental" title={t('check.tlds.experimental')}>
            {t('check.tlds.experimental')}
          </span>
        {/if}
        {#if flags?.minYears}
          <span class="flag min-years" title={t('check.tlds.minYears', { n: flags.minYears })}>
            {t('check.tlds.minYears', { n: flags.minYears })}
          </span>
        {/if}
        {#if flags?.premiumLikely}
          <span class="flag premium" title={t('check.tlds.premiumLikely')}>
            {t('check.tlds.premiumLikely')}
          </span>
        {/if}
      </button>
    {/each}
  </div>

  <div class="selected-count" aria-live="polite">
    {t('check.tlds.selected', { n: $selectedTlds.length })}
    {#if $selectedTlds.length > 0}
      <button class="clear-sel" type="button" onclick={() => selectedTlds.set([])}>
        {t('check.tlds.clearSel')}
      </button>
    {/if}
  </div>
</div>

<style>
  .tld-picker {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
  }
  .search {
    flex: 1;
    min-width: 160px;
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--bg-elevated);
    color: var(--text);
    font-size: var(--text-sm);
    min-height: 36px;
    transition: border-color var(--dur) var(--ease), box-shadow var(--dur) var(--ease);
  }
  .search:hover {
    border-color: var(--border-strong);
  }
  .search:focus {
    border-color: var(--accent);
    outline: none;
    box-shadow: 0 0 0 3px var(--accent-soft);
  }
  .presets {
    display: flex;
    gap: var(--space-1);
  flex-wrap: wrap;
  }
  .preset {
    padding: var(--space-1) var(--space-3);
    border: 1px solid var(--border);
    background: var(--bg-elevated);
    color: var(--text-secondary);
    border-radius: var(--radius-full);
    font-size: var(--text-xs);
    font-weight: 500;
    cursor: pointer;
    min-height: 32px;
    transition: all var(--dur) var(--ease);
  }
  .preset:hover {
    border-color: var(--border-strong);
    color: var(--text);
  }
  .preset.active {
    background: var(--accent-soft);
    border-color: var(--accent);
    color: var(--accent);
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
    max-height: 340px;
    overflow-y: auto;
    padding: var(--space-1) var(--space-1) var(--space-1) 0;
    scrollbar-width: thin;
    scrollbar-color: var(--border-strong) transparent;
  }

  .chips::-webkit-scrollbar {
    width: 6px;
  }

  .chips::-webkit-scrollbar-thumb {
    background: var(--border-strong);
    border-radius: var(--radius-full);
  }

  .chips::-webkit-scrollbar-track {
    background: transparent;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    padding: var(--space-1) var(--space-2);
    border: 1px solid var(--border);
    background: var(--bg-elevated);
    color: var(--text-secondary);
    border-radius: var(--radius-sm);
    font-size: var(--text-xs);
    cursor: pointer;
    min-height: 32px;
    transition: all var(--dur) var(--ease);
    white-space: nowrap;
  }
  .chip:hover {
    border-color: var(--border-strong);
    background: var(--bg-sunken);
  }
  .chip.selected {
    border-color: var(--accent);
    background: var(--accent-soft);
    color: var(--accent);
  }
  .chip .tld {
    font-weight: 600;
  }
  .chip .price {
    color: var(--text-tertiary);
    font-size: 11px;
  }
  .chip.selected .price {
    color: var(--accent);
    opacity: 0.8;
  }
  .flag {
    font-size: 10px;
    padding: 0 4px;
    border-radius: var(--radius-full);
    line-height: 1.5;
    font-weight: 500;
  }
  .flag.experimental {
    background: var(--amber-soft);
    color: var(--amber);
  }
  .flag.min-years {
    background: var(--neutral-soft);
    color: var(--text-tertiary);
  }
  .flag.premium {
    background: var(--amber-soft);
    color: var(--amber);
  }
  .selected-count {
    font-size: var(--text-xs);
    color: var(--text-tertiary);
    font-weight: 500;
  }
  .selected-count {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }
  .clear-sel {
    border: none;
    background: transparent;
    color: var(--accent);
    font-size: var(--text-xs);
    cursor: pointer;
    padding: 0;
  }
  .dot-unstable {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--amber);
    display: inline-block;
    flex: none;
  }
</style>
