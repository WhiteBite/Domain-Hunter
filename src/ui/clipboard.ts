/**
 * Shared clipboard helper — navigator.clipboard with an execCommand textarea
 * fallback for insecure contexts (file://, http localhost) and older browsers.
 *
 * Returns true when the text reached the clipboard. Callers own the
 * success/failure UX (toast, copied-state flash, etc.).
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    document.body.removeChild(ta);
    return ok;
  }
}
