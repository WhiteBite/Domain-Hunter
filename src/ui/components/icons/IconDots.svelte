<script lang="ts">
  interface Props {
    size?: number;
    class?: string;
  }
  let { size, class: cls }: Props = $props();
</script>

<svg viewBox="0 0 16 16" aria-hidden="true" class={cls} width={size} height={size}>
  <circle cx="3" cy="8" r="1.4" fill="currentColor" />
  <circle cx="8" cy="8" r="1.4" fill="currentColor" />
  <circle cx="13" cy="8" r="1.4" fill="currentColor" />
</svg>
