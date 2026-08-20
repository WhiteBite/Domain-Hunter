<script lang="ts">
  interface Props {
    filled?: boolean;
    strokeWidth?: number;
    size?: number;
    class?: string;
  }
  let { filled = false, strokeWidth, size, class: cls }: Props = $props();
</script>

<svg viewBox="0 0 16 16" aria-hidden="true" class={cls} width={size} height={size}>
  <path
    d="M8 2.5l1.7 3.6 3.9.5-2.9 2.7.8 3.9L8 11.3l-3.5 1.9.8-3.9-2.9-2.7 3.9-.5z"
    fill={filled ? 'currentColor' : 'none'}
    stroke={filled && strokeWidth == null ? undefined : 'currentColor'}
    stroke-width={strokeWidth ?? 1.5}
    stroke-linejoin="round"
  />
</svg>
