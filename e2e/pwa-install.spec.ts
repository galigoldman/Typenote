import { test, expect } from '@playwright/test';

test.describe('PWA Installation Meta Tags', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('page has viewport meta tag', async ({ page }) => {
    const viewport = page.locator('meta[name="viewport"]');
    await expect(viewport).toHaveCount(1);

    const content = await viewport.getAttribute('content');
    expect(content).toBeTruthy();
    expect(content).toContain('width=device-width');
  });

  test('page has manifest link', async ({ page }) => {
    const manifestLink = page.locator('link[rel="manifest"]');
    await expect(manifestLink).toHaveCount(1);

    const href = await manifestLink.getAttribute('href');
    expect(href).toBe('/manifest.json');
  });

  test('page has apple-mobile-web-app-capable meta tag', async ({ page }) => {
    const capable = page.locator('meta[name="apple-mobile-web-app-capable"]');
    await expect(capable).toHaveCount(1);

    const content = await capable.getAttribute('content');
    expect(content).toBe('yes');
  });

  test('page has theme-color meta tag', async ({ page }) => {
    const themeColor = page.locator('meta[name="theme-color"]');
    await expect(themeColor).toHaveCount(1);

    const content = await themeColor.getAttribute('content');
    expect(content).toBe('#18181b');
  });

  test('page has apple-touch-icon link', async ({ page }) => {
    const icon = page.locator('link[rel="apple-touch-icon"]');
    await expect(icon).toHaveCount(1);

    const href = await icon.getAttribute('href');
    expect(href).toContain('apple-touch-icon');
  });
});
