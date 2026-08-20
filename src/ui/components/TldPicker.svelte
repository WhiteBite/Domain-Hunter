<script lang="ts">
  import { onMount } from 'svelte';
  import { registry, selectedTlds, settings, pricing } from '../store';
  import { bestEntry, formatPrice, tco3 } from '../../pricing/pricing';
  import { t } from '../../i18n';
  import { get } from 'svelte/store';
  import { popover } from '../popover';
  import { trapFocus } from '../focustrap';

  type Preset = 'popular' | 'cheapest' | 'all';

  let search = $state('');
  let activePreset = $state<Preset | null>(null);
  let health = $state<Record<string, { ok?: boolean }>>({});
  let popoverOpen = $state(false);
  let popoverEl: HTMLDivElement | null = $state(null);
  let triggerEl: HTMLButtonElement | null = $state(null);

  // Collapsible group open states (all open by default so every chip is
  // reachable without expanding — the popover's own scroll contains the list).
  let popularOpen = $state(true);
  let cheapestOpen = $state(true);
  let allOpen = $state(true);

  // Cap popover height to available viewport space. When there isn't enough
  // room below the trigger, flip the popover upward so it opens above with the
  // full header-space available. Re-measures on resize.
  $effect(() => {
    if (!popoverOpen || !popoverEl) return;
    const measure = (): void => {
      const el = popoverEl;
      if (!el) return;
      const picker = el.parentElement;
      if (!picker) return;
      const pickerRect = picker.getBoundingClientRect();
      const availableBelow = window.innerHeight - pickerRect.bottom - 24;
      if (availableBelow < 200) {
        // Flip upward: position above the picker, cap to space above.
        el.style.top = 'auto';
        el.style.bottom = 'calc(100% + var(--space-1))';
        const availableAbove = pickerRect.top - 24;
        el.style.maxHeight = `${Math.max(120, Math.min(420, availableAbove))}px`;
      } else {
        // Normal: position below the picker, cap to space below.
        el.style.top = 'calc(100% + var(--space-1))';
        el.style.bottom = 'auto';
        el.style.maxHeight = `${Math.max(120, Math.min(420, availableBelow))}px`;
      }
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  });

  function closePopover(): void {
    popoverOpen = false;
  }

  function togglePopover(): void {
    popoverOpen = !popoverOpen;
  }

  onMount(() => {
    // health.json only exists on hosted builds; file:// fetches are CSP-blocked.
    if (typeof location !== 'undefined' && location.protocol === 'file:') return;
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

  const allTlds = $derived.by(() => {
    // Deduplicate: the live IANA bootstrap can return TLDs already in the
    // curated tlds.json, causing duplicate {#each} keys. Keep first occurrence.
    const seen = new Set<string>();
    const result: typeof $registry.tlds = [];
    for (const c of $registry.tlds) {
      if (!seen.has(c.tld)) {
        seen.add(c.tld);
        result.push(c);
      }
    }
    return result;
  });

  const cheapestTlds = $derived.by(() => {
    const table = $pricing?.table;
    if (!table) return [];
    const arr = allTlds
      .map((c) => ({ tld: c.tld, tco: tco3(table, c.tld) }))
      .filter((x) => x.tco != null) as { tld: string; tco: number }[];
    arr.sort((a, b) => a.tco - b.tco);
    return arr.slice(0, 15).map((x) => x.tld);
  });

  const popularTlds = $derived.by(() => {
    const defaults = get(settings).defaultTlds;
    return allTlds.filter((c) => defaults.includes(c.tld));
  });

  // Deduplicate across groups: popular first, then cheapest-not-in-popular,
  // then all-the-rest (alphabetical). Each TLD appears exactly once so
  // data-testid="tld-chip-{tld}" stays unique in the DOM.
  const popularSet = $derived(new Set(popularTlds.map((c) => c.tld)));
  const cheapestSet = $derived(new Set(cheapestTlds));

  const cheapestOnlyTlds = $derived.by(() =>
    allTlds.filter((c) => cheapestSet.has(c.tld) && !popularSet.has(c.tld)),
  );

  const allRestTlds = $derived.by(() => {
    const arr = allTlds.filter((c) => !popularSet.has(c.tld) && !cheapestSet.has(c.tld));
    return [...arr].sort((a, b) => a.tld.localeCompare(b.tld));
  });

  // Flat filtered list when searching (respects search query only).
  const filteredAll = $derived.by(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allTlds;
    return allTlds.filter((c) => c.tld.includes(q));
  });

  const isSearching = $derived(search.trim().length > 0);

  function toggle(tld: string): void {
    const current = get(selectedTlds);
    if (current.includes(tld)) {
      selectedTlds.set(current.filter((t) => t !== tld));
    } else {
      selectedTlds.set([...current, tld]);
    }
  }

  function applyPreset(p: Preset): void {
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
    return formatPrice(best.entry.reg, $settings);
  }

  function chipFlags(tld: string) {
    const cfg = allTlds.find((c) => c.tld === tld);
    return cfg?.flags ?? null;
  }

  // Summary pills: first 8 selected TLDs as removable chips (deduplicated).
  const summaryPills = $derived.by(() => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const tld of $selectedTlds) {
      if (!seen.has(tld)) {
        seen.add(tld);
        result.push(tld);
      }
    }
    return result.slice(0, 8);
  });
  const summaryOverflow = $derived(Math.max(0, $selectedTlds.length - 8));
</script>

<div
  class="tld-picker"
  use:popover={{ open: popoverOpen, onClose: closePopover, triggerEl }}
  role="group"
  aria-label={t('check.tlds.title')}
>
  <div class="tld-summary">
    <button
      class="tld-trigger"
      class:active={popoverOpen}
      type="button"
      bind:this={triggerEl}
      onclick={togglePopover}
      aria-expanded={popoverOpen}
      aria-haspopup="listbox"
      aria-controls={popoverOpen ? 'tld-popover' : undefined}
      data-testid="tld-picker-toggle"
      aria-label={t('tld.picker.aria')}
    >
      <svg class="chevron" class:rot={popoverOpen} viewBox="0 0 16 16" aria-hidden="true">
        <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      <span class="trigger-label">{t('check.tlds.title')}</span>
      <span class="trigger-count nums" data-testid="tld-selected-count" aria-live="polite">{$selectedTlds.length}</span>
    </button>

    {#if $selectedTlds.length > 0}
      <button
        class="clear-sel"
        type="button"
        onclick={() => selectedTlds.set([])}
        data-testid="tld-button-clear"
      >
        {t('check.tlds.clearSel')}
      </button>
    {/if}
  </div>

  {#if $selectedTlds.length > 0}
    <div class="tld-pills">
      {#each summaryPills as tld (tld)}
        <button
          class="tld-pill"
          type="button"
          onclick={() => toggle(tld)}
          data-testid={`tld-pill-remove-${tld}`}
          title={t('check.tlds.clearSel')}
        >
          <span>.{tld}</span>
          <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 3l6 6M9 3l-6 6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" /></svg>
        </button>
      {/each}
      {#if summaryOverflow > 0}
        <span class="tld-more nums">+{summaryOverflow}</span>
      {/if}
    </div>
  {/if}

  {#if popoverOpen}
    <div class="popover" id="tld-popover" role="listbox" aria-label={t('check.tlds.title')} bind:this={popoverEl} use:trapFocus>
      <input
        class="search"
        type="search"
        placeholder={t('check.tlds.search')}
        bind:value={search}
        aria-label={t('check.tlds.search')}
        data-testid="tld-input-search"
      />

      <div class="presets" role="group" aria-label={t('check.tlds.title')}>
        <button
          class="preset"
          class:active={activePreset === 'popular'}
          onclick={() => applyPreset('popular')}
          type="button"
          data-testid="tld-preset-popular"
        >
          {t('check.tlds.presets.popular')}
        </button>
        <button
          class="preset"
          class:active={activePreset === 'cheapest'}
          onclick={() => applyPreset('cheapest')}
          type="button"
          data-testid="tld-preset-cheapest"
        >
          {t('check.tlds.presets.cheapest')}
        </button>
        <button
          class="preset"
          class:active={activePreset === 'all'}
          onclick={() => applyPreset('all')}
          type="button"
          data-testid="tld-preset-all"
        >
          {t('check.tlds.presets.all')}
        </button>
      </div>

      <div class="zone-list">
        {#if isSearching}
          {#each filteredAll as cfg (cfg.tld)}
            {@const price = chipPrice(cfg.tld)}
            {@const flags = chipFlags(cfg.tld)}
            {@const selected = $selectedTlds.includes(cfg.tld)}
            <button
              class="zone-row"
              class:selected
              role="option"
              aria-selected={selected}
              onclick={() => toggle(cfg.tld)}
              type="button"
              data-testid={`tld-chip-${cfg.tld}`}
              title={
                flags?.reputationNote
                  ? t('check.tlds.spamNote')
                  : isUnstable(cfg.tld)
                    ? t('check.tlds.unstable')
                    : undefined
              }
            >
              <span class="zone-check" aria-hidden="true">
                {#if selected}
                  <svg viewBox="0 0 16 16"><path d="M3 8l3 3 7-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>
                {/if}
              </span>
              <span class="tld">.{cfg.tld}</span>
              {#if isUnstable(cfg.tld)}
                <span class="dot-unstable" aria-hidden="true"></span>
              {/if}
              {#if price}
                <span class="price nums">{price}</span>
              {:else}
                <span class="price price-none" aria-hidden="true">—</span>
              {/if}
              {#if flags?.experimental}
                <span class="flag experimental" title={t('check.tlds.experimental')}>{t('check.tlds.experimental')}</span>
              {/if}
              {#if flags?.minYears}
                <span class="flag min-years" title={t('check.tlds.minYears', { n: flags.minYears })}>{t('check.tlds.minYears', { n: flags.minYears })}</span>
              {/if}
              {#if flags?.premiumLikely}
                <span class="flag premium" title={t('check.tlds.premiumLikely')}>{t('check.tlds.premiumLikely')}</span>
              {/if}
            </button>
          {/each}
        {:else}
          {#if popularTlds.length > 0}
            <div class="group">
              <button
                class="group-toggle"
                type="button"
                onclick={() => (popularOpen = !popularOpen)}
                aria-expanded={popularOpen}
                data-testid="tld-group-popular"
              >
                <svg class="gchevron" class:rot={popularOpen} viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /></svg>
                {t('check.tlds.presets.popular')}
                <span class="group-count nums">{popularTlds.length}</span>
              </button>
              {#if popularOpen}
                {#each popularTlds as cfg (cfg.tld)}
                  {@const price = chipPrice(cfg.tld)}
                  {@const flags = chipFlags(cfg.tld)}
                  {@const selected = $selectedTlds.includes(cfg.tld)}
                  <button
                    class="zone-row"
                    class:selected
                    role="option"
                    aria-selected={selected}
                    onclick={() => toggle(cfg.tld)}
                    type="button"
                    data-testid={`tld-chip-${cfg.tld}`}
                    title={
                      flags?.reputationNote
                        ? t('check.tlds.spamNote')
                        : isUnstable(cfg.tld)
                          ? t('check.tlds.unstable')
                          : undefined
                    }
                  >
                    <span class="zone-check" aria-hidden="true">
                      {#if selected}
                        <svg viewBox="0 0 16 16"><path d="M3 8l3 3 7-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>
                      {/if}
                    </span>
                    <span class="tld">.{cfg.tld}</span>
                    {#if isUnstable(cfg.tld)}
                      <span class="dot-unstable" aria-hidden="true"></span>
                    {/if}
                    {#if price}
                      <span class="price nums">{price}</span>
                    {:else}
                      <span class="price price-none" aria-hidden="true">—</span>
                    {/if}
                    {#if flags?.experimental}
                      <span class="flag experimental" title={t('check.tlds.experimental')}>{t('check.tlds.experimental')}</span>
                    {/if}
                    {#if flags?.minYears}
                      <span class="flag min-years" title={t('check.tlds.minYears', { n: flags.minYears })}>{t('check.tlds.minYears', { n: flags.minYears })}</span>
                    {/if}
                    {#if flags?.premiumLikely}
                      <span class="flag premium" title={t('check.tlds.premiumLikely')}>{t('check.tlds.premiumLikely')}</span>
                    {/if}
                  </button>
                {/each}
              {/if}
            </div>
          {/if}

          {#if cheapestOnlyTlds.length > 0}
            <div class="group">
              <button
                class="group-toggle"
                type="button"
                onclick={() => (cheapestOpen = !cheapestOpen)}
                aria-expanded={cheapestOpen}
                data-testid="tld-group-cheapest"
              >
                <svg class="gchevron" class:rot={cheapestOpen} viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /></svg>
                {t('check.tlds.presets.cheapest')}
                <span class="group-count nums">{cheapestOnlyTlds.length}</span>
              </button>
              {#if cheapestOpen}
                {#each cheapestOnlyTlds as cfg (cfg.tld)}
                  {@const price = chipPrice(cfg.tld)}
                  {@const flags = chipFlags(cfg.tld)}
                  {@const selected = $selectedTlds.includes(cfg.tld)}
                  <button
                    class="zone-row"
                    class:selected
                    role="option"
                    aria-selected={selected}
                    onclick={() => toggle(cfg.tld)}
                    type="button"
                    data-testid={`tld-chip-${cfg.tld}`}
                    title={
                      flags?.reputationNote
                        ? t('check.tlds.spamNote')
                        : isUnstable(cfg.tld)
                          ? t('check.tlds.unstable')
                          : undefined
                    }
                  >
                    <span class="zone-check" aria-hidden="true">
                      {#if selected}
                        <svg viewBox="0 0 16 16"><path d="M3 8l3 3 7-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>
                      {/if}
                    </span>
                    <span class="tld">.{cfg.tld}</span>
                    {#if isUnstable(cfg.tld)}
                      <span class="dot-unstable" aria-hidden="true"></span>
                    {/if}
                    {#if price}
                      <span class="price nums">{price}</span>
                    {:else}
                      <span class="price price-none" aria-hidden="true">—</span>
                    {/if}
                    {#if flags?.experimental}
                      <span class="flag experimental" title={t('check.tlds.experimental')}>{t('check.tlds.experimental')}</span>
                    {/if}
                    {#if flags?.minYears}
                      <span class="flag min-years" title={t('check.tlds.minYears', { n: flags.minYears })}>{t('check.tlds.minYears', { n: flags.minYears })}</span>
                    {/if}
                    {#if flags?.premiumLikely}
                      <span class="flag premium" title={t('check.tlds.premiumLikely')}>{t('check.tlds.premiumLikely')}</span>
                    {/if}
                  </button>
                {/each}
              {/if}
            </div>
          {/if}

          {#if allRestTlds.length > 0}
            <div class="group">
              <button
                class="group-toggle"
                type="button"
                onclick={() => (allOpen = !allOpen)}
                aria-expanded={allOpen}
                data-testid="tld-group-all"
              >
                <svg class="gchevron" class:rot={allOpen} viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /></svg>
                {t('tld.group.all')}
                <span class="group-count nums">{allRestTlds.length}</span>
              </button>
              {#if allOpen}
                {#each allRestTlds as cfg (cfg.tld)}
                  {@const price = chipPrice(cfg.tld)}
                  {@const flags = chipFlags(cfg.tld)}
                  {@const selected = $selectedTlds.includes(cfg.tld)}
                  <button
                    class="zone-row"
                    class:selected
                    role="option"
                    aria-selected={selected}
                    onclick={() => toggle(cfg.tld)}
                    type="button"
                    data-testid={`tld-chip-${cfg.tld}`}
                    title={
                      flags?.reputationNote
                        ? t('check.tlds.spamNote')
                        : isUnstable(cfg.tld)
                          ? t('check.tlds.unstable')
                          : undefined
                    }
                  >
                    <span class="zone-check" aria-hidden="true">
                      {#if selected}
                        <svg viewBox="0 0 16 16"><path d="M3 8l3 3 7-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>
                      {/if}
                    </span>
                    <span class="tld">.{cfg.tld}</span>
                    {#if isUnstable(cfg.tld)}
                      <span class="dot-unstable" aria-hidden="true"></span>
                    {/if}
                    {#if price}
                      <span class="price nums">{price}</span>
                    {:else}
                      <span class="price price-none" aria-hidden="true">—</span>
                    {/if}
                    {#if flags?.experimental}
                      <span class="flag experimental" title={t('check.tlds.experimental')}>{t('check.tlds.experimental')}</span>
                    {/if}
                    {#if flags?.minYears}
                      <span class="flag min-years" title={t('check.tlds.minYears', { n: flags.minYears })}>{t('check.tlds.minYears', { n: flags.minYears })}</span>
                    {/if}
                    {#if flags?.premiumLikely}
                      <span class="flag premium" title={t('check.tlds.premiumLikely')}>{t('check.tlds.premiumLikely')}</span>
                    {/if}
                  </button>
                {/each}
              {/if}
            </div>
          {/if}
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .tld-picker {
    position: relative;
    display: flex;
    flex-direction: column;
  }

  /* Row 1: trigger left, clear-selection pinned right. */
  .tld-summary {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .tld-trigger {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    padding: 0 var(--space-3);
    min-height: 36px;
    border: 1px solid var(--border);
    background: var(--bg-elevated);
    color: var(--text);
    border-radius: var(--radius-md);
    font-size: var(--text-sm);
    font-weight: 500;
    cursor: pointer;
    transition: all var(--dur) var(--ease);
  }
  .tld-trigger:hover {
    border-color: var(--border-strong);
    background: var(--bg-sunken);
  }
  .tld-trigger.active {
    border-color: var(--accent);
    background: var(--accent-soft);
    color: var(--accent);
  }
  .tld-trigger .chevron {
    width: 14px;
    height: 14px;
    transition: transform var(--dur) var(--ease);
  }
  .tld-trigger .chevron.rot {
    transform: rotate(180deg);
  }
  .trigger-count {
    font-size: var(--text-xs);
    color: var(--text-tertiary);
    background: var(--bg-sunken);
    padding: 0 var(--space-2);
    border-radius: var(--radius-full);
    min-width: 20px;
    text-align: center;
  }
  .tld-trigger.active .trigger-count {
    color: var(--accent);
    background: color-mix(in srgb, var(--accent-soft) 60%, transparent);
  }

  /* Row 2: full-width wrap of removable pills, own block below row 1. */
  .tld-pills {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
    margin-top: var(--space-2);
    min-width: 0;
  }
  .tld-pill {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    padding: 0 var(--space-1) 0 var(--space-2);
    border: 1px solid var(--border);
    background: var(--accent-soft);
    color: var(--accent);
    border-radius: var(--radius-full);
    font-size: 11px;
    font-weight: 500;
    min-height: 24px;
    cursor: pointer;
    transition: all var(--dur) var(--ease);
    white-space: nowrap;
  }
  .tld-pill:hover {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent-soft) 70%, var(--bg-elevated));
  }
  .tld-pill svg {
    width: 10px;
    height: 10px;
    opacity: 0.7;
  }
  .tld-pill:hover svg {
    opacity: 1;
  }
  .tld-more {
    font-size: 11px;
    color: var(--text-tertiary);
    padding: 0 var(--space-1);
    line-height: 24px;
  }

  .clear-sel {
    border: none;
    background: transparent;
    color: var(--accent);
    font-size: var(--text-xs);
    cursor: pointer;
    padding: 0;
    min-height: 24px;
    margin-left: auto;
  }

  .popover {
    position: absolute;
    top: calc(100% + var(--space-1));
    left: 0;
    width: 360px;
    max-width: calc(100vw - var(--space-4) * 2);
    max-height: 420px;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-3);
    border: 1px solid var(--border);
    background: var(--bg-elevated);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-lg);
    z-index: 101;
  }

  .search {
    width: 100%;
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

  .zone-list {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    scrollbar-width: thin;
    scrollbar-color: var(--border-strong) transparent;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding-right: var(--space-1);
  }
  .zone-list::-webkit-scrollbar {
    width: 6px;
  }
  .zone-list::-webkit-scrollbar-thumb {
    background: var(--border-strong);
    border-radius: var(--radius-full);
  }
  .zone-list::-webkit-scrollbar-track {
    background: transparent;
  }

  .group {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .group-toggle {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-1) var(--space-2);
    border: none;
    background: transparent;
    color: var(--text-secondary);
    font-size: var(--text-xs);
    font-weight: 600;
    cursor: pointer;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    transition: color var(--dur) var(--ease);
  }
  .group-toggle:hover {
    color: var(--text);
  }
  .group-toggle .gchevron {
    width: 12px;
    height: 12px;
    transition: transform var(--dur) var(--ease);
  }
  .group-toggle .gchevron.rot {
    transform: rotate(180deg);
  }
  .group-count {
    color: var(--text-tertiary);
    font-weight: 400;
  }

  .zone-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-1) var(--space-2);
    border: 1px solid transparent;
    background: transparent;
    color: var(--text-secondary);
    border-radius: var(--radius-sm);
    font-size: var(--text-xs);
    cursor: pointer;
    min-height: 32px;
    transition: all var(--dur) var(--ease);
    text-align: left;
    width: 100%;
  }
  .zone-row:hover {
    background: var(--bg-sunken);
    color: var(--text);
  }
  .zone-row.selected {
    background: var(--accent-soft);
    color: var(--accent);
  }
  .zone-check {
    width: 16px;
    height: 16px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm);
    flex: none;
  }
  .zone-row.selected .zone-check {
    border-color: var(--accent);
    background: var(--accent);
    color: var(--on-accent);
  }
  .zone-check svg {
    width: 12px;
    height: 12px;
  }
  .zone-row .tld {
    font-weight: 600;
  }
  .zone-row .price {
    color: var(--text-tertiary);
    margin-left: auto;
  }
  /* Zones without pricing data show a muted dash instead of a blank right side. */
  .zone-row .price.price-none {
    color: var(--text-quaternary);
  }
  .zone-row.selected .price {
    color: var(--accent);
    opacity: 0.8;
  }
  .zone-row.selected .price.price-none {
    color: var(--text-quaternary);
    opacity: 1;
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
  .dot-unstable {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--amber);
    display: inline-block;
    flex: none;
  }

  @media (max-width: 860px) {
    .popover {
      width: 100%;
    }
  }
</style>
