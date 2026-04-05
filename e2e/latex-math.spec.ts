import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

test.describe('LaTeX Math', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);

    // Open the first seeded document to get into the editor
    const firstDoc = page.locator('[data-testid="document-card"]').first();
    await expect(firstDoc).toBeVisible({ timeout: 10_000 });
    await firstDoc.click();
    await expect(page).toHaveURL(/\/dashboard\/documents\//, {
      timeout: 10_000,
    });

    // Wait for the editor to load
    await expect(page.locator('.ProseMirror')).toBeVisible({
      timeout: 10_000,
    });
  });

  test('insert math with :{ trigger', async ({ page }) => {
    // LaTeX uses AI conversion which may not be available in CI.
    // Skip if AI key is not configured.
    test.skip(
      !!process.env.CI,
      'LaTeX AI conversion needs GOOGLE_GENERATIVE_AI_API_KEY in CI',
    );
    test.setTimeout(30_000);

    // Focus the editor and type the trigger sequence
    await page.locator('.ProseMirror').click();
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.type(':');
    await page.keyboard.type('{');

    // The math input box should appear
    const mathInput = page.locator(
      'input[placeholder="Describe math in plain English..."]',
    );
    await expect(mathInput).toBeVisible({ timeout: 5_000 });

    // Type a math expression and confirm
    await mathInput.fill('x squared plus y');
    await page.keyboard.press('Enter');

    // Wait for AI conversion and rendering
    // A rendered math expression should appear in the editor
    await expect(page.locator('span[data-type="math-expression"]')).toBeVisible(
      { timeout: 15_000 },
    );
  });

  test('rendered math displays as formatted output, not raw text', async ({
    page,
  }) => {
    // Check if seeded documents have any math expressions
    const mathExpressions = page.locator('span[data-type="math-expression"]');
    const count = await mathExpressions.count();

    if (count > 0) {
      // Math expressions should contain KaTeX rendered HTML, not raw LaTeX
      const firstMath = mathExpressions.first();
      await expect(firstMath).toBeVisible();

      // KaTeX renders into spans with class "katex"
      await expect(firstMath.locator('.katex')).toBeVisible();
    } else {
      // No math in this document — test passes vacuously
      // This will be properly tested when we have seeded math content
      test.skip(true, 'No math expressions in seeded document');
    }
  });

  test('edit existing math expression', async ({ page }) => {
    test.skip(
      !!process.env.CI,
      'LaTeX AI conversion needs GOOGLE_GENERATIVE_AI_API_KEY in CI',
    );
    test.setTimeout(30_000);

    const mathExpressions = page.locator('span[data-type="math-expression"]');
    const count = await mathExpressions.count();

    if (count === 0) {
      test.skip(true, 'No math expressions in seeded document to edit');
      return;
    }

    // Click on the first math expression to open the editor
    await mathExpressions.first().click();

    // Edit panel should appear with mode buttons
    const editLatexButton = page.getByRole('button', {
      name: 'Edit LaTeX',
    });
    await expect(editLatexButton).toBeVisible({ timeout: 5_000 });

    // Switch to raw LaTeX mode
    await editLatexButton.click();

    // Find the input and modify it
    const input = page.locator('input[placeholder="Enter LaTeX code..."]');
    await expect(input).toBeVisible();
    await input.clear();
    await input.fill('y^2 + z^2');
    await page.keyboard.press('Enter');

    // The expression should update
    await expect(mathExpressions.first()).toBeVisible();
  });

  test('delete math expression', async ({ page }) => {
    const mathExpressions = page.locator('span[data-type="math-expression"]');
    const count = await mathExpressions.count();

    if (count === 0) {
      test.skip(true, 'No math expressions in seeded document to delete');
      return;
    }

    // Click on the math expression to select it, then delete
    await mathExpressions.first().click();
    await page.keyboard.press('Backspace');

    // There should be one fewer math expression
    await expect(mathExpressions).toHaveCount(count - 1);
  });

  test('math renders LTR inside RTL text', async ({ page }) => {
    test.skip(
      !!process.env.CI,
      'LaTeX AI conversion needs GOOGLE_GENERATIVE_AI_API_KEY in CI',
    );
    test.setTimeout(30_000);

    // Focus the editor
    const editor = page.locator('.ProseMirror');
    await editor.click();
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');

    // Type Hebrew text (RTL)
    await page.keyboard.type('זהו טקסט בעברית ');

    // Insert math with :{ trigger
    await page.keyboard.type(':');
    await page.keyboard.type('{');

    const mathInput = page.locator(
      'input[placeholder="Describe math in plain English..."]',
    );
    await expect(mathInput).toBeVisible({ timeout: 5_000 });
    await mathInput.fill('a in A');
    await page.keyboard.press('Enter');

    // Wait for math to render
    await expect(
      page.locator('span[data-type="math-expression"]').last(),
    ).toBeVisible({ timeout: 15_000 });

    // Verify the math node has LTR direction (math is always LTR)
    const mathNode = page.locator('span[data-type="math-expression"]').last();
    const dir = await mathNode.evaluate((el) => getComputedStyle(el).direction);
    expect(dir).toBe('ltr');
  });
});
