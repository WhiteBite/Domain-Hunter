<script lang="ts">
  import type { CheckStatus } from '../../types';
  import { t } from '../../i18n';

  interface Props {
    status: CheckStatus;
    size?: 'sm' | 'md';
  }
  let { status, size = 'md' }: Props = $props();

  type Variant = 'available' | 'probably' | 'taken' | 'unknown' | 'error';

  const variant = $derived<Variant>(
    status === 'available'
      ? 'available'
      : status === 'probably_available'
        ? 'probably'
        : status === 'taken'
          ? 'taken'
          : status === 'unknown'
            ? 'unknown'
            : 'error',
  );

  const labelKey = $derived(
    status === 'available'
      ? 'status.available'
      : status === 'probably_available'
        ? 'status.probably_available'
        : status === 'taken'
          ? 'status.taken'
          : status === 'unknown'
            ? 'status.unknown'
            : 'status.error',
  );

  const tooltipKey = $derived(
    status === 'probably_available'
      ? 'status.probably_available.tooltip'
      : status === 'unknown'
        ? 'status.unknown.tooltip'
        : status === 'error'
          ? 'status.error.tooltip'
          : null,
  );
</script>

<span
  class="badge {variant} {size}"
  role="img"
  aria-label={t(labelKey)}
  title={tooltipKey ? t(tooltipKey) : undefined}
  tabindex={tooltipKey ? 0 : undefined}
>
  <span class="dot" aria-hidden="true"></span>
  <span class="label">{t(labelKey)}</span>
</span>

<style>
  .badge {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    padding: 2px var(--space-2);
    border-radius: var(--radius-full);
    font-size: var(--text-xs);
    font-weight: 500;
    line-height: 1.4;
    border: 1px solid transparent;
    white-space: nowrap;
    cursor: default;
  }
  .badge.sm {
    font-size: 11px;
    padding: 1px var(--space-2);
  }
  .badge[tabindex]:hover {
    box-shadow: var(--shadow-sm);
  }
  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex: none;
  }
  .label {
    line-height: 1.2;
  }

  .available {
    background: var(--green-soft);
    color: var(--green);
    border-color: color-mix(in srgb, var(--green) 22%, transparent);
  }
  .available .dot {
    background: var(--green);
  }

  .probably {
    background: transparent;
    color: var(--green);
    border-color: color-mix(in srgb, var(--green) 45%, transparent);
  }
  .probably .dot {
    background: transparent;
    border: 1.5px solid var(--green);
  }

  .taken {
    background: var(--neutral-soft);
    color: var(--text-secondary);
  }
  .taken .dot {
    background: var(--text-tertiary);
  }

  .unknown {
    background: var(--amber-soft);
    color: var(--amber);
    border-color: color-mix(in srgb, var(--amber) 22%, transparent);
  }
  .unknown .dot {
    background: var(--amber);
  }

  .error {
    background: var(--red-soft);
    color: var(--red);
    border-color: color-mix(in srgb, var(--red) 22%, transparent);
  }
  .error .dot {
    background: var(--red);
  }
</style>
