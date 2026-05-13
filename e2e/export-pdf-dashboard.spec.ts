import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';
import { neuterPopupPrint, settlePopup } from './helpers/pdf-export';

test.describe('Export PDF from Dashboard', () => {
  test.beforeEach(async ({ page, context }) => {
    await neuterPopupPrint(context);
    await login(page);
  });

  test('Export as PDF option exists in document card context menu', async ({
    page,
  }) => {
    const card = page.locator('[data-testid="document-card"]').first();
    await card.waitFor({ timeout: 10_000 });

    await card.getByRole('button', { name: 'Document options' }).click();

    await expect(
      page.getByRole('menuitem', { name: /export as pdf/i }),
    ).toBeVisible();
  });

  test('clicking Export as PDF opens a print popup with rendered HTML', async ({
    page,
    context,
  }) => {
    test.setTimeout(60_000);

    const card = page.locator('[data-testid="document-card"]').first();
    await card.waitFor({ timeout: 10_000 });

    // Grab the doc title from the card so we can verify the popup matches.
    const cardTitle = (
      await card.locator('.truncate').first().textContent()
    )?.trim();
    expect(cardTitle, 'card title text must be present').toBeTruthy();

    await card.getByRole('button', { name: 'Document options' }).click();

    // The print flow opens a new tab and calls window.print(). We neutered
    // print() in beforeEach so the HTML stays on screen for inspection.
    const popupPromise = context.waitForEvent('page', { timeout: 30_000 });
    await page.getByRole('menuitem', { name: /export as pdf/i }).click();
    const popup = await popupPromise;

    await settlePopup(popup);

    // Popup title is set from the document title — proves print-export.ts
    // wrote real HTML, not just opened a blank window.
    await expect(popup).toHaveTitle(cardTitle!);

    // The TipTap content wrapper must exist in the popup body. A broken
    // flow (e.g. throw before document.write) would fail this assertion.
    await expect(popup.locator('.content')).toBeAttached();
  });
});
