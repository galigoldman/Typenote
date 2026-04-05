import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

test.describe('Export PDF from Editor', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/test/editor');
    // Wait for the TipTap editor to mount
    await expect(page.locator('.ProseMirror')).toBeVisible();
  });

  test('Export as PDF button is visible in toolbar', async ({ page }) => {
    await expect(
      page.getByRole('button', { name: 'Export as PDF', exact: true }),
    ).toBeVisible();
  });

  test('clicking Export as PDF triggers a download', async ({ page }) => {
    // PDF export uses puppeteer-core for server-side rendering, which needs
    // its own Chromium binary not available in CI. Skip until CI installs it.
    test.skip(!!process.env.CI, 'PDF export needs puppeteer Chromium in CI');
    test.setTimeout(60_000);

    // Listen for the download event before clicking
    const downloadPromise = page.waitForEvent('download', { timeout: 45_000 });

    await page
      .getByRole('button', { name: 'Export as PDF', exact: true })
      .click();

    const download = await downloadPromise;

    // Verify the filename ends with .pdf
    expect(download.suggestedFilename()).toMatch(/\.pdf$/);
    // The mock document title is "Test Document"
    expect(download.suggestedFilename()).toBe('Test Document.pdf');
  });

  test('exported PDF contains text content', async ({ page }) => {
    test.skip(!!process.env.CI, 'PDF export needs puppeteer Chromium in CI');
    test.setTimeout(60_000);

    // The test editor has "Hello world" content
    const downloadPromise = page.waitForEvent('download', { timeout: 45_000 });
    await page
      .getByRole('button', { name: 'Export as PDF', exact: true })
      .click();

    const download = await downloadPromise;

    // Save the PDF to a temp file and parse it
    const filePath = path.join('/tmp', `test-pdf-${Date.now()}.pdf`);
    await download.saveAs(filePath);

    // Use pdf-parse to extract text
    const pdfParse = (await import('pdf-parse')).default;
    const pdfBuffer = fs.readFileSync(filePath);
    const pdfData = await pdfParse(pdfBuffer);

    // The test editor content is "Hello world"
    expect(pdfData.text).toContain('Hello world');

    // Clean up
    fs.unlinkSync(filePath);
  });

  test('exported PDF has correct page count', async ({ page }) => {
    test.skip(!!process.env.CI, 'PDF export needs puppeteer Chromium in CI');
    test.setTimeout(60_000);

    const downloadPromise = page.waitForEvent('download', { timeout: 45_000 });
    await page
      .getByRole('button', { name: 'Export as PDF', exact: true })
      .click();

    const download = await downloadPromise;

    const filePath = path.join('/tmp', `test-pdf-pages-${Date.now()}.pdf`);
    await download.saveAs(filePath);

    const pdfParse = (await import('pdf-parse')).default;
    const pdfBuffer = fs.readFileSync(filePath);
    const pdfData = await pdfParse(pdfBuffer);

    // Single page document should have at least 1 page
    expect(pdfData.numpages).toBeGreaterThanOrEqual(1);

    fs.unlinkSync(filePath);
  });
});
