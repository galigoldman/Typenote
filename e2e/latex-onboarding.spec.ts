import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';
import {
  upsertFixtureDocument,
  deleteFixtureDocument,
  type FixtureDocument,
} from './helpers/db';

let currentDocId = '';

function buildFixture(id: string): FixtureDocument {
  return {
    id,
    title: 'LaTeX Onboarding Test',
    canvas_type: 'blank',
    content: {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Hello world' }],
        },
      ],
    },
  };
}

test.describe('LaTeX Onboarding Tooltip', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    currentDocId = `bb000000-0000-0000-0000-${String(testInfo.testId).padStart(12, '0').slice(-12)}`;
    await upsertFixtureDocument(buildFixture(currentDocId));
    await login(page);
  });

  test.afterEach(async () => {
    if (currentDocId) await deleteFixtureDocument(currentDocId);
  });

  test('first-time user sees onboarding popover with "Got it" button', async ({
    page,
  }) => {
    // Clear any existing dismissal
    await page.goto(`/dashboard/documents/${currentDocId}`);
    await page.evaluate(() =>
      localStorage.removeItem('typenote:latex-onboarding-dismissed'),
    );
    await page.reload();

    // Wait for editor to load
    await expect(page.locator('.ProseMirror').first()).toBeVisible();

    // Popover should auto-appear
    const popover = page.getByRole('dialog', { name: 'LaTeX onboarding' });
    await expect(popover).toBeVisible();
    await expect(popover.getByText('Math made easy')).toBeVisible();
    await expect(popover.getByRole('button', { name: 'Got it' })).toBeVisible();
  });

  test('clicking "Got it" dismisses the popover and persists dismissal', async ({
    page,
  }) => {
    await page.goto(`/dashboard/documents/${currentDocId}`);
    await page.evaluate(() =>
      localStorage.removeItem('typenote:latex-onboarding-dismissed'),
    );
    await page.reload();
    await expect(page.locator('.ProseMirror').first()).toBeVisible();

    const popover = page.getByRole('dialog', { name: 'LaTeX onboarding' });
    await expect(popover).toBeVisible();

    // Click "Got it"
    await popover.getByRole('button', { name: 'Got it' }).click();
    await expect(popover).not.toBeVisible();

    // Reload — popover should NOT auto-appear
    await page.reload();
    await expect(page.locator('.ProseMirror').first()).toBeVisible();
    await expect(popover).not.toBeVisible();
  });

  test('returning user can click LaTeX icon to see help (no "Got it")', async ({
    page,
  }) => {
    // Pre-set dismissal
    await page.goto(`/dashboard/documents/${currentDocId}`);
    await page.evaluate(() =>
      localStorage.setItem('typenote:latex-onboarding-dismissed', 'true'),
    );
    await page.reload();
    await expect(page.locator('.ProseMirror').first()).toBeVisible();

    // Popover should NOT auto-appear
    const popover = page.getByRole('dialog', { name: 'LaTeX onboarding' });
    await expect(popover).not.toBeVisible();

    // Click LaTeX icon
    await page
      .getByRole('button', { name: 'LaTeX shortcut', exact: true })
      .click();
    await expect(popover).toBeVisible();
    await expect(popover.getByText('Math made easy')).toBeVisible();

    // No "Got it" button for returning users
    await expect(
      popover.getByRole('button', { name: 'Got it' }),
    ).not.toBeVisible();

    // Click outside to close
    await page.locator('.ProseMirror').first().click();
    await expect(popover).not.toBeVisible();
  });
});
