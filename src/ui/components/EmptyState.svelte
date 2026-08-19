<script lang="ts">
  import { t } from '../../i18n';
  import { activeTab, checkInput } from '../store';

  function goGenerators() {
    activeTab.set('generators');
  }

  function fillExample() {
    checkInput.set('midas\naurora\nkite\nnorthwind\nlumen');
  }
</script>

<div class="empty" role="status">
  <svg class="illustration" viewBox="0 0 96 96" aria-hidden="true">
    <!-- Radar sweep rings -->
    <circle cx="48" cy="48" r="40" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3" />
    <circle cx="48" cy="48" r="28" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.35" />
    <circle cx="48" cy="48" r="16" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.5" />
    <!-- Crosshair -->
    <path d="M48 4v8M48 84v8M4 48h8M84 48h8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0.35" />
    <!-- Sweep beam -->
    <path d="M48 48L84 28" fill="none" stroke="var(--accent)" stroke-width="1.5" stroke-linecap="round" opacity="0.6" />
    <!-- Scattered dots: available (green) + unknown (amber) -->
    <circle cx="62" cy="34" r="2.5" fill="var(--green-solid)" />
    <circle cx="38" cy="62" r="2.5" fill="var(--green-solid)" />
    <circle cx="70" cy="58" r="2.5" fill="var(--amber)" opacity="0.7" />
    <circle cx="30" cy="40" r="2.5" fill="var(--amber)" opacity="0.7" />
    <!-- Center dot -->
    <circle cx="48" cy="48" r="3" fill="var(--accent)" />
  </svg>
  <h3 class="title">{t('results.empty.title')}</h3>
  <p class="body">{t('results.empty.body')}</p>
  <div class="actions">
    <button class="cta" onclick={goGenerators} type="button" data-testid="check-button-empty-cta">
      {t('tab.generators')}
      <svg class="arrow" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M3 8h10M9 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </button>
    <button class="cta secondary" onclick={fillExample} type="button" data-testid="check-button-example">
      {t('results.empty.example')}
    </button>
  </div>
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
  .illustration {
    width: 96px;
    height: 96px;
    color: var(--text-secondary);
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
  .actions {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    flex-wrap: wrap;
    justify-content: center;
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
  .cta.secondary {
    color: var(--text-secondary);
    background: transparent;
  }
  .cta.secondary:hover {
    color: var(--text);
    background: var(--bg-sunken);
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
