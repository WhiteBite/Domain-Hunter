<script lang="ts">
  import { t } from '../../i18n';
  import { activeTab } from '../store';

  function goGenerators() {
    activeTab.set('generators');
  }
</script>

<div class="empty" role="status">
  <svg class="icon" viewBox="0 0 48 48" aria-hidden="true">
    <circle cx="20" cy="20" r="14" fill="none" stroke="currentColor" stroke-width="2.5" />
    <path d="M31 31l10 10" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" />
  </svg>
  <h3 class="title">{t('results.empty.title')}</h3>
  <p class="body">{t('results.empty.body')}</p>
  <button class="cta" onclick={goGenerators} type="button" data-testid="check-button-empty-cta">
    {t('tab.generators')}
    <svg class="arrow" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3 8h10M9 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  </button>
</div>

<style>
  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: var(--space-2);
    padding: var(--space-7) var(--space-4);
    color: var(--text-secondary);
  }
  .icon {
    width: 40px;
    height: 40px;
    color: var(--text-tertiary);
    margin-bottom: var(--space-2);
  }
  .title {
    margin: 0;
    font-size: var(--text-lg);
    font-weight: 600;
    color: var(--text);
  }
  .body {
    margin: 0 0 var(--space-2);
    max-width: 420px;
    font-size: var(--text-sm);
    line-height: 1.6;
    color: var(--text-secondary);
  }
  .cta {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-4);
    border: 1px solid var(--border);
    background: var(--bg-elevated);
    color: var(--accent);
    border-radius: var(--radius-md);
    font-size: var(--text-sm);
    font-weight: 500;
    cursor: pointer;
    min-height: 40px;
    transition: background var(--dur) var(--ease), border-color var(--dur) var(--ease);
  }
  .cta:hover {
    background: var(--bg-sunken);
    border-color: var(--border-strong);
  }
  .arrow {
    width: 14px;
    height: 14px;
    transition: transform var(--dur) var(--ease);
  }
  .cta:hover .arrow {
    transform: translateX(2px);
  }
</style>
