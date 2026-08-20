<script lang="ts">
  interface Props {
    radius?: number;
    size?: number;
    class?: string;
  }
  let { radius = 6, size, class: cls }: Props = $props();
</script>

<svg viewBox="0 0 16 16" aria-hidden="true" class={cls} width={size} height={size}>
  <circle cx="8" cy="8" {radius} fill="none" stroke="currentColor" stroke-width="1.5" />
  <path d="M8 7.4v3.2M8 5.2v.2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
</svg>
