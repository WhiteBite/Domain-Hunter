<script lang="ts">
  import { t } from '../../i18n';

  let showHint = $state(false);

  function dismissHint(): void {
    showHint = false;
    try {
      localStorage.setItem('dh:v1:hint-dismissed', '1');
    } catch {
      // non-fatal
    }
  }

  // Check localStorage on mount (component is created when CheckTab mounts).
  try {
    if (!localStorage.getItem('dh:v1:hint-dismissed')) showHint = true;
  } catch {
    showHint = true;
  }
</script>

{#if showHint}
  <div class="hint-strip" role="note" data-testid="check-hint-strip">
    <ol class="hint-steps">
      <li>{t('check.hint.1')}</li>
      <li>{t('check.hint.2')}</li>
      <li>{t('check.hint.3')}</li>
    </ol>
    <button class="hint-dismiss" type="button" onclick={dismissHint} data-testid="check-button-hint-dismiss">
      {t('check.hint.dismiss')}
    </button>
  </div>
{/if}

<style>
  .hint-strip {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    flex-wrap: wrap;
    padding: var(--space-2) var(--space-4);
    border: 1px solid var(--border);
    background: var(--bg-elevated);
    border-radius: var(--radius-md);
    font-size: var(--text-sm);
    color: var(--text-secondary);
  }

  .hint-steps {
    margin: 0;
    padding-left: 1.2em;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .hint-dismiss {
    border: none;
    background: var(--accent-soft);
    color: var(--accent);
    border-radius: var(--radius-full);
    padding: var(--space-1) var(--space-3);
    min-height: 32px;
    font-size: var(--text-xs);
    font-weight: 500;
    cursor: pointer;
  }
</style>
