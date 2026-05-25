import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

const COURSE_URL = '/dashboard/courses/30000000-0000-0000-0000-000000000001';

test.describe('Homework-focused AI context', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto(COURSE_URL);
    await expect(page).toHaveURL(/\/dashboard\/courses\//, { timeout: 10_000 });
  });

  test('start homework, see context chip, ask the AI', async ({ page }) => {
    test.setTimeout(90_000);

    // Open the Start Homework dialog
    await page.getByRole('button', { name: /start homework/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5_000 });

    // Pick the seeded exercise document
    await page
      .getByRole('dialog')
      .getByText('Problem Set 1: Variables', { exact: false })
      .first()
      .click();

    // Pin a material if any are offered (best-effort — the flow must work with 0 pins too)
    const firstMaterialCheckbox = page
      .getByRole('dialog')
      .locator('input[type="checkbox"]')
      .first();
    if (await firstMaterialCheckbox.count()) {
      await firstMaterialCheckbox.check().catch(() => {});
    }

    // Start → navigates to the new homework document
    await page.getByRole('button', { name: /^start$/i }).click();
    await expect(page).toHaveURL(/\/dashboard\/documents\//, {
      timeout: 15_000,
    });

    // The homework context chip consumes getHomeworkContext
    const chip = page.getByTestId('homework-context');
    await expect(chip).toBeVisible({ timeout: 10_000 });
    await expect(chip).toContainText('Problem Set 1');

    // Open the AI tutor (floating bubble has aria-label "Open AI chat")
    await page
      .getByRole('button', { name: /open ai chat/i })
      .first()
      .click();
    await expect(page.getByText('AI Tutor')).toBeVisible({ timeout: 5_000 });

    const input = page.locator(
      'input[placeholder*="about your course materials"]',
    );
    await expect(input).toBeVisible({ timeout: 5_000 });
    await input.fill('What is question 1 of this exercise asking?');
    await page.keyboard.press('Enter');

    // A response bubble appears (real Gemini; generous timeout)
    await expect(page.locator('text=AI Assistant').first()).toBeVisible({
      timeout: 60_000,
    });
  });
});
