<script lang="ts">
  interface Props {
    size?: number;
    class?: string;
  }
  let { size, class: cls }: Props = $props();
</script>

<svg viewBox="0 0 16 16" aria-hidden="true" class={cls} width={size} height={size}>
  <rect x="4" y="4" width="9" height="9" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.5" />
  <path d="M3 11V3h8" fill="none" stroke="currentColor" stroke-width="1.5" />
</svg>
