<script lang="ts">
  interface Props {
    size?: number;
    class?: string;
  }
  let { size, class: cls }: Props = $props();
</script>

<svg viewBox="0 0 16 16" aria-hidden="true" class={cls} width={size} height={size}>
  <path d="M3 8l3 3 7-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
</svg>
