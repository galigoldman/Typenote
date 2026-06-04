/**
 * Copy text to the clipboard, returning whether it succeeded.
 *
 * The async Clipboard API (`navigator.clipboard`) only exists in a *secure
 * context* — HTTPS or `http://localhost`. Served over plain HTTP to an IP
 * (e.g. a LAN/demo host) `navigator.clipboard` is `undefined`, so we fall back
 * to a hidden-textarea + `document.execCommand('copy')`, which works without a
 * secure context. Callers should surface success/failure to the user rather
 * than assuming the copy worked.
 */
export async function copyText(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Permission denied or blocked — fall through to the legacy path.
    }
  }

  if (typeof document === 'undefined') return false;

  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    // Keep it off-screen and non-disruptive while still selectable.
    textarea.style.position = 'fixed';
    textarea.style.top = '-9999px';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    textarea.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}
