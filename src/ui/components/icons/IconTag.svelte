<script lang="ts">
  interface Props {
    size?: number;
    class?: string;
  }
  let { size, class: cls }: Props = $props();
</script>

<svg viewBox="0 0 16 16" aria-hidden="true" class={cls} width={size} height={size}>
  <path
    d="M8.5 1.5H3a1.5 1.5 0 0 0-1.5 1.5v5.5a1.5 1.5 0 0 0 .44 1.06l5 5a1.5 1.5 0 0 0 2.12 0l4.5-4.5a1.5 1.5 0 0 0 0-2.12l-5-5A1.5 1.5 0 0 0 8.5 1.5Z"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linejoin="round"
  />
  <circle cx="5.5" cy="5.5" r="1" fill="currentColor" />
</svg>
