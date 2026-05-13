import { type Page, type BrowserContext } from '@playwright/test';

/**
 * Neuter `window.open` to prevent the print popup from actually printing.
 *
 * The PDF export flow (`src/lib/pdf/print-export.ts`) opens a new window with
 * the rendered HTML and immediately calls `window.print()`. In a headless
 * browser that would hang waiting for a non-existent dialog. We override
 * `window.print` on the popup to a no-op so the HTML stays rendered and the
 * test can inspect or screenshot it.
 */
export async function neuterPopupPrint(context: BrowserContext) {
  await context.addInitScript(() => {
    const original = window.open;
    window.open = function (...args: Parameters<typeof window.open>) {
      const w = original.apply(this, args);
      if (w) {
        const neuter = () => {
          try {
            w.print = () => {};
          } catch {
            /* cross-origin or closed */
          }
        };
        neuter();
        try {
          w.addEventListener('load', neuter);
        } catch {
          /* ignore */
        }
      }
      return w;
    };
  });
}

/**
 * Wait for the print popup to finish loading fonts and disable animations
 * so subsequent assertions / screenshots are stable.
 */
export async function settlePopup(
  popup: Page,
  viewport?: { width: number; height: number },
) {
  if (viewport) await popup.setViewportSize(viewport);
  await popup.waitForLoadState('domcontentloaded');
  await popup.evaluate(async () => {
    if (document.fonts) await document.fonts.ready;
  });
  await popup.addStyleTag({
    content: `
      *, *::before, *::after {
        animation-duration: 0s !important;
        transition-duration: 0s !important;
      }
    `,
  });
  await popup.waitForLoadState('networkidle');
}
