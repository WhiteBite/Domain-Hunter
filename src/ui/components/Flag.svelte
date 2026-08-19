<script lang="ts">
  /**
   * Inline-SVG country flag for a locale code.
   * Emoji flags are NOT used: Windows browsers render them as letter codes
   * (e.g. "CN"), so SVG is the only dependency-free cross-platform option.
   * Simplified, recognizable-at-16px designs; viewBox 0 0 20 14.
   */
  import type { Locale } from '../../types';

  interface Props {
    code: Locale;
    /** Rendered width in px (height scales 14:20). */
    size?: number;
  }
  let { code, size = 18 }: Props = $props();
  const h = $derived(Math.round((size * 14) / 20));
</script>

<svg
  class="flag"
  viewBox="0 0 20 14"
  width={size}
  height={h}
  role="img"
  aria-label={code}
  data-testid={`flag-${code}`}
>
  {#if code === 'en'}
    <!-- Union Jack (simplified) -->
    <rect width="20" height="14" fill="#012169" />
    <path d="M0,0 L20,14 M20,0 L0,14" stroke="#fff" stroke-width="3" />
    <path d="M0,0 L20,14 M20,0 L0,14" stroke="#C8102E" stroke-width="1.2" />
    <path d="M10,0 V14 M0,7 H20" stroke="#fff" stroke-width="5" />
    <path d="M10,0 V14 M0,7 H20" stroke="#C8102E" stroke-width="2.6" />
  {:else if code === 'ru'}
    <rect width="20" height="4.67" y="0" fill="#fff" />
    <rect width="20" height="4.67" y="4.67" fill="#0039A6" />
    <rect width="20" height="4.67" y="9.33" fill="#D52B1E" />
  {:else if code === 'es'}
    <rect width="20" height="3.5" y="0" fill="#AA151B" />
    <rect width="20" height="7" y="3.5" fill="#F1BF00" />
    <rect width="20" height="3.5" y="10.5" fill="#AA151B" />
  {:else if code === 'de'}
    <rect width="20" height="4.67" y="0" fill="#000" />
    <rect width="20" height="4.67" y="4.67" fill="#DD0000" />
    <rect width="20" height="4.67" y="9.33" fill="#FFCE00" />
  {:else if code === 'pt'}
    <rect width="8" height="14" x="0" fill="#046A38" />
    <rect width="12" height="14" x="8" fill="#DA291C" />
    <circle cx="8" cy="7" r="3" fill="#FFDA44" />
  {:else if code === 'zh'}
    <rect width="20" height="14" fill="#DE2910" />
    <polygon
      points="5,2 5.71,4.03 7.85,4.07 6.14,5.37 6.76,7.43 5,6.2 3.24,7.43 3.86,5.37 2.15,4.07 4.29,4.03"
      fill="#FFDE00"
    />
  {:else if code === 'ja'}
    <rect width="20" height="14" fill="#fff" />
    <circle cx="10" cy="7" r="4.2" fill="#BC002D" />
  {:else if code === 'fr'}
    <rect width="6.67" height="14" x="0" fill="#0055A4" />
    <rect width="6.67" height="14" x="6.67" fill="#fff" />
    <rect width="6.67" height="14" x="13.33" fill="#EF4135" />
  {/if}
</svg>

<style>
  .flag {
    flex: none;
    border-radius: 2px;
    /* White stripes need an outline against light backgrounds. */
    box-shadow: 0 0 0 1px color-mix(in srgb, currentColor 18%, transparent);
  }
</style>
