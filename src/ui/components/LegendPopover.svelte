<script lang="ts">
  import { t } from '../../i18n';
  import { popover } from '../popover';
  import { trapFocus } from '../focustrap';
  import IconInfo from './icons/IconInfo.svelte';
  import type { CheckStatus } from '../../types';

  interface LegendItem {
    status: CheckStatus;
    labelKey: string;
    descKey: string;
    variant: 'available' | 'probably' | 'taken' | 'unknown' | 'error';
  }

  const legendItems: LegendItem[] = [
    { status: 'available', labelKey: 'status.available', descKey: 'results.legend.available', variant: 'available' },
    { status: 'probably_available', labelKey: 'status.probably_available', descKey: 'results.legend.probably_available', variant: 'probably' },
    { status: 'taken', labelKey: 'status.taken', descKey: 'results.legend.taken', variant: 'taken' },
    { status: 'unknown', labelKey: 'status.unknown', descKey: 'results.legend.unknown', variant: 'unknown' },
    { status: 'error', labelKey: 'status.error', descKey: 'results.legend.error', variant: 'error' },
  ];

  let open = $state(false);
  let triggerEl: HTMLButtonElement | null = $state(null);

  function toggle(): void {
    open = !open;
  }
</script>

<div
  class="legend-wrap"
  use:popover={{ open, onClose: () => (open = false), triggerEl }}
>
  <button
    class="action-btn legend-toggle"
    type="button"
    bind:this={triggerEl}
    onclick={toggle}
    aria-haspopup="dialog"
    aria-expanded={open}
    aria-label={t('results.legend.aria')}
    title={t('results.legend.aria')}
    data-testid="results-legend-toggle"
  >
    <IconInfo radius={6.5} />
  </button>
  {#if open}
    <div class="legend" role="dialog" aria-label={t('results.legend.aria')} use:trapFocus>
      {#each legendItems as item}
        <div class="legend-row">
          <span class="legend-dot {item.variant}" aria-hidden="true"></span>
          <span class="legend-name">{t(item.labelKey)}</span>
          <span class="legend-desc">{t(item.descKey)}</span>
        </div>
      {/each}
      <div class="legend-divider" aria-hidden="true"></div>
      <div class="legend-shortcuts">
        <span class="legend-name legend-section-title">{t('results.shortcuts.title')}</span>
        <ul class="shortcut-list">
          <li><kbd>/</kbd> <span>{t('results.shortcuts.search')}</span></li>
          <li><kbd>1–5</kbd> <span>{t('results.shortcuts.filters')}</span></li>
          <li><kbd>s</kbd> <span>{t('results.shortcuts.sortCycle')}</span></li>
          <li><kbd>S</kbd> <span>{t('results.shortcuts.sortDir')}</span></li>
        </ul>
      </div>
    </div>
  {/if}
</div>

<style>
  .legend-wrap {
    position: relative;
    display: inline-flex;
  }
  .legend-toggle.active {
    border-color: var(--accent);
    color: var(--accent);
    background: var(--accent-soft);
  }
  .legend {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-3);
    border: 1px solid var(--border);
    background: var(--bg-elevated);
    border-radius: 8px;
    box-shadow: var(--shadow-pop);
    z-index: 60;
    min-width: 280px;
    max-width: 340px;
  }
  .legend-row {
    display: grid;
    grid-template-columns: 12px 1fr;
    grid-template-areas:
      'dot name'
      'dot desc';
    column-gap: var(--space-2);
    row-gap: 1px;
    align-items: start;
  }
  .legend-dot {
    grid-area: dot;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    margin-top: 5px;
  }
  .legend-dot.available {
    background: var(--green-solid);
  }
  .legend-dot.probably {
    background: transparent;
    border: 1.5px solid var(--green);
  }
  .legend-dot.taken {
    background: var(--text-tertiary);
  }
  .legend-dot.unknown {
    background: var(--amber);
  }
  .legend-dot.error {
    background: var(--red);
  }
  .legend-name {
    grid-area: name;
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--text);
  }
  .legend-desc {
    grid-area: desc;
    font-size: var(--text-xs);
    color: var(--text-secondary);
    line-height: 1.4;
  }
  .legend-divider {
    height: 1px;
    background: var(--border);
    margin: var(--space-1) 0;
  }
  .legend-shortcuts {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  .legend-section-title {
    font-size: var(--text-xs);
    color: var(--text-tertiary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: var(--space-1);
  }
  .shortcut-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .shortcut-list li {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-xs);
    color: var(--text-secondary);
  }
  .shortcut-list kbd {
    font-family: var(--font-sans);
    font-size: 10px;
    line-height: 1;
    padding: 2px 5px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg-sunken);
    color: var(--text-tertiary);
    min-width: 20px;
    text-align: center;
  }
  /* Shared .action-btn (+ :hover, svg) lives in src/ui/chrome.css. */
</style>
