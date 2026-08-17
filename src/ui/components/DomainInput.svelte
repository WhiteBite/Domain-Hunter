<script lang="ts">
  import { checkInput, selectedTlds } from '../store';
  import { normalizeDomainInput } from '../../core/idn';
  import { t } from '../../i18n';

  const MAX_NAMES = 3000;
  const MAX_CANDIDATES = 30000;

  let debouncedText = $state('');

  $effect(() => {
    const current = $checkInput;
    const id = setTimeout(() => {
      debouncedText = current;
    }, 150);
    return () => clearTimeout(id);
  });

  const parsed = $derived(normalizeDomainInput(debouncedText));

  const candidateCount = $derived.by(() => {
    const tlds = $selectedTlds;
    let total = 0;
    for (const name of parsed.names) {
      total += name.includes('.') ? 1 : tlds.length;
    }
    return total;
  });

  const tooMany = $derived(parsed.names.length > MAX_NAMES || candidateCount > MAX_CANDIDATES);
  const overNames = $derived(parsed.names.length > MAX_NAMES);
  const overCandidates = $derived(candidateCount > MAX_CANDIDATES);
</script>

<div class="domain-input">
  <textarea
    class="input"
    bind:value={$checkInput}
    placeholder={t('check.input.placeholder')}
    rows="4"
    spellcheck="false"
    autocomplete="off"
    aria-label={t('check.title')}
  ></textarea>
  <div class="meta">
    <span class="hint">{t('check.input.hint')}</span>
    <div class="preview" aria-live="polite">
      {#if parsed.names.length > 0}
        <span class="count" class:warn={tooMany}>
          {t('check.input.parsed', {
            names: parsed.names.length,
            zones: $selectedTlds.length,
            total: candidateCount,
          })}
        </span>
        {#if parsed.invalid > 0}
          <span class="invalid">{t('check.input.invalid', { n: parsed.invalid })}</span>
        {/if}
        {#if tooMany}
          <span class="warn-text">
            {t('check.input.tooMany', { max: overNames ? MAX_NAMES : MAX_CANDIDATES })}
          </span>
        {/if}
      {/if}
    </div>
  </div>
</div>

<style>
  .domain-input {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .input {
    width: 100%;
    min-height: 96px;
    padding: var(--space-3);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--bg-elevated);
    color: var(--text);
    font-size: var(--text-sm);
    font-family: var(--font-sans);
    line-height: 1.6;
    resize: vertical;
    transition: border-color var(--dur) var(--ease), box-shadow var(--dur) var(--ease);
  }
  .input:hover {
    border-color: var(--border-strong);
  }
  .input:focus {
    border-color: var(--accent);
    outline: none;
    box-shadow: 0 0 0 3px var(--accent-soft);
  }
  .meta {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  .hint {
    font-size: var(--text-xs);
    color: var(--text-tertiary);
  }
  .preview {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-xs);
    min-height: 18px;
  }
  .count {
    color: var(--text-secondary);
    font-weight: 500;
  }
  .count.warn {
    color: var(--red);
  }
  .invalid {
    color: var(--amber);
  font-weight: 500;
  }
  .warn-text {
    color: var(--red);
    font-weight: 500;
  }
</style>
