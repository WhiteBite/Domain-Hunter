/**
 * Shared UI helpers extracted from components to kill copy-paste duplication.
 *
 * - sanitizeId: stable DOM-id/testid slug from arbitrary text (domain names,
 *   word-set names, theme words). Used by ResultsTable, GeneratorsTab, DropsTab.
 * - createToast: timer-managed transient toast message factory. Used by
 *   GeneratorsTab and DropsTab (identical 1.8s toast pattern).
 * - downloadText: generic blob-anchor download. Used by GeneratorsTab for
 *   JSON export (csv.ts keeps its own downloadCsv for CSV-specific BOM/CRLF).
 */

/** Replace every non-alphanumeric character with `-` so arbitrary text is safe as a DOM id / data-testid suffix. */
export function sanitizeId(s: string): string {
  return s.replace(/[^a-zA-Z0-9]/g, '-');
}

/**
 * Create a toast controller: `show(msg)` sets the message and auto-clears it
 * after `duration` ms (default 1800). `destroy()` clears any pending timer
 * (call from onDestroy). The caller owns the reactive `toast` state and passes
 * a setter so the controller can update it.
 */
export function createToast(
  set: (msg: string) => void,
  duration = 1800,
): { show: (msg: string) => void; destroy: () => void } {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    show(msg: string) {
      set(msg);
      if (timer != null) clearTimeout(timer);
      timer = setTimeout(() => set(''), duration);
    },
    destroy() {
      if (timer != null) clearTimeout(timer);
    },
  };
}

/**
 * Trigger a browser download of `text` as `filename` with the given MIME type.
 * Appends the anchor to the body before clicking (Firefox requires it) and
 * removes it immediately after.
 */
export function downloadText(filename: string, text: string, mime: string): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
