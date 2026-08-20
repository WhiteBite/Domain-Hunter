<script lang="ts">
  /**
   * Transient toast notification. Renders nothing when `message` is empty.
   * Uses the global `.toast` class from `chrome.css` (centered, no animation).
   * Components that need a divergent toast position/animation wrap this in a
   * local anchor with a `:global(.toast)` override.
   */
  interface Props {
    message: string;
    testid?: string;
  }
  let { message, testid }: Props = $props();
</script>

{#if message}
  <div class="toast" role="status" data-testid={testid}>{message}</div>
{/if}
