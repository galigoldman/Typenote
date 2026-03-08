import { test, expect } from '@playwright/test';

test.describe('Touch optimization', () => {
  test.describe('sidebar toggle on tablet viewport', () => {
    test.use({ viewport: { width: 768, height: 1024 } });

    test('sidebar toggle button is visible at 768px width', async ({
      page,
    }) => {
      await page.goto('/dashboard');
      // On small viewports the hamburger toggle should be visible
      const toggleButton = page.getByTestId('sidebar-toggle');
      await expect(toggleButton).toBeVisible();
    });

    test('sidebar opens and closes via toggle', async ({ page }) => {
      await page.goto('/dashboard');
      const sidebar = page.getByTestId('sidebar');
      const toggleButton = page.getByTestId('sidebar-toggle');

      // Sidebar should be off-screen by default on small viewport
      await expect(sidebar).toHaveCSS(
        'transform',
        'matrix(1, 0, 0, 1, -250, 0)',
      );

      // Open sidebar
      await toggleButton.click();
      await expect(sidebar).toHaveCSS('transform', 'none');

      // Close sidebar via the close button
      const closeButton = page.getByRole('button', { name: 'Close sidebar' });
      await closeButton.click();
      await expect(sidebar).toHaveCSS(
        'transform',
        'matrix(1, 0, 0, 1, -250, 0)',
      );
    });
  });

  test.describe('card action menus visibility at tablet viewport', () => {
    test.use({ viewport: { width: 768, height: 1024 } });

    test('folder card action buttons have touch:opacity-100 class', async ({
      page,
    }) => {
      await page.goto('/dashboard');

      // Check that folder card action buttons include touch:opacity-100
      // We look for buttons with aria-label "Folder actions"
      const folderActionButtons = page.getByRole('button', {
        name: 'Folder actions',
      });

      const count = await folderActionButtons.count();
      for (let i = 0; i < count; i++) {
        const btn = folderActionButtons.nth(i);
        const className = await btn.getAttribute('class');
        expect(className).toContain('touch:opacity-100');
      }
    });

    test('document card action buttons have touch:opacity-100 class', async ({
      page,
    }) => {
      await page.goto('/dashboard');

      // Check that document card action buttons include touch:opacity-100
      const docActionButtons = page.getByRole('button', {
        name: 'Document options',
      });

      const count = await docActionButtons.count();
      for (let i = 0; i < count; i++) {
        const btn = docActionButtons.nth(i);
        const className = await btn.getAttribute('class');
        expect(className).toContain('touch:opacity-100');
      }
    });
  });

  test.describe('no horizontal scrolling on dashboard', () => {
    test.use({ viewport: { width: 768, height: 1024 } });

    test('page body does not scroll horizontally at 768px', async ({
      page,
    }) => {
      await page.goto('/dashboard');

      // Check that the document body does not have horizontal overflow
      const bodyScrollWidth = await page.evaluate(
        () => document.body.scrollWidth,
      );
      const bodyClientWidth = await page.evaluate(
        () => document.body.clientWidth,
      );

      expect(bodyScrollWidth).toBeLessThanOrEqual(bodyClientWidth);
    });
  });
});
