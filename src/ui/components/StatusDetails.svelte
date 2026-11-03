<script lang="ts">
  import { statusHelpKey } from '../../core/status-help';
  import { t } from '../../i18n';
  let { statuses }: { statuses: string[] } = $props();
</script>
<div class="status-list" role="list" aria-label={t('card.statuses.aria')}>
  {#each statuses as st (st)}
    {@const key = statusHelpKey(st)}
    <div role="listitem"><span class="chip-tag">{st}</span>{#if key}<span> {t(key)}</span>{/if}</div>
  {/each}
</div>
<style>
  .status-list { display: flex; flex-direction: column; gap: 4px; color: var(--text-secondary); font-size: var(--text-xs); }
</style>
