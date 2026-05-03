import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

/**
 * Seed the test document with math content via Supabase REST API,
 * then navigate to it. This ensures math expressions exist in the
 * editor regardless of prior test state.
 */
// Use "Quick Notes" (loose doc, not in any folder) to avoid contaminating folder-based tests
const SEEDED_DOC_ID = '20000000-0000-0000-0000-000000000006';
const DOC_URL = `/dashboard/documents/${SEEDED_DOC_ID}`;

const SUPABASE_URL = 'http://127.0.0.1:54321';
const LOCAL_SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

/** Pages JSON with math expressions inside textBoxes */
function buildMathPages() {
  const pageId = `${SEEDED_DOC_ID}-math-p0`;
  return {
    pages: [
      {
        id: pageId,
        order: 0,
        strokes: [],
        pageType: 'lined',
        textBoxes: [
          {
            id: `${pageId}-ftb`,
            x: 40,
            y: 40,
            width: 714,
            height: 400,
            isFullWidth: true,
            content: {
              type: 'doc',
              content: [
                {
                  type: 'heading',
                  attrs: { level: 1, textAlign: null },
                  content: [{ type: 'text', text: 'Math Test Document' }],
                },
                {
                  type: 'paragraph',
                  content: [
                    { type: 'text', text: 'Here is a formula: ' },
                    {
                      type: 'mathExpression',
                      attrs: {
                        latex: 'x^2 + y',
                        originalText: 'x squared plus y',
                      },
                    },
                    { type: 'text', text: ' and more text.' },
                  ],
                },
                {
                  type: 'paragraph',
                  content: [
                    { type: 'text', text: 'Another: ' },
                    {
                      type: 'mathExpression',
                      attrs: {
                        latex: '\\frac{a}{b}',
                        originalText: 'a over b',
                      },
                    },
                  ],
                },
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: 'End of document.' }],
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

async function seedMathDocument(): Promise<void> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/documents?id=eq.${SEEDED_DOC_ID}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        apikey: LOCAL_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${LOCAL_SERVICE_ROLE_KEY}`,
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ pages: buildMathPages() }),
    },
  );
  if (!res.ok) {
    throw new Error(
      `Failed to seed math document: ${res.status} ${await res.text()}`,
    );
  }
}

/** Restore the document to its original state (no pages, original content) */
async function restoreDocument(): Promise<void> {
  await fetch(`${SUPABASE_URL}/rest/v1/documents?id=eq.${SEEDED_DOC_ID}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      apikey: LOCAL_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${LOCAL_SERVICE_ROLE_KEY}`,
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ pages: null }),
  });
}

test.describe('LaTeX Math', () => {
  test.beforeEach(async ({ page }) => {
    await seedMathDocument();

    await login(page);
    await page.goto(DOC_URL);
    await expect(page).toHaveURL(/\/dashboard\/documents\//, {
      timeout: 10_000,
    });

    // Wait for the editor to load
    await expect(page.locator('.ProseMirror').first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test('insert math with :{ trigger', async ({ page }) => {
    test.skip(
      !!process.env.CI,
      'LaTeX AI conversion needs GOOGLE_GENERATIVE_AI_API_KEY in CI',
    );
    test.setTimeout(30_000);

    // Focus the editor and type the trigger sequence
    await page.locator('.ProseMirror').first().click();
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.type(':');
    await page.keyboard.type('{');

    // The math input box should appear
    const mathInput = page.locator(
      'textarea[placeholder="Describe math in plain English..."]',
    );
    await expect(mathInput).toBeVisible({ timeout: 5_000 });

    // Type a math expression and confirm
    await mathInput.fill('x squared plus y');
    await page.keyboard.press('Enter');

    // Wait for AI conversion and rendering — more than the 2 seeded math nodes
    await expect(page.locator('.math-expression-node')).toHaveCount(3, {
      timeout: 15_000,
    });
  });

  test('rendered math displays as formatted output, not raw text', async ({
    page,
  }) => {
    const mathExpressions = page.locator('.math-expression-node');
    await expect(mathExpressions.first()).toBeVisible({ timeout: 5_000 });

    // KaTeX renders into spans with class "katex"
    await expect(mathExpressions.first().locator('.katex')).toBeVisible();
  });

  test('edit existing math expression', async ({ page }) => {
    const mathExpressions = page.locator('.math-expression-node');
    await expect(mathExpressions.first()).toBeVisible({ timeout: 5_000 });

    // Click at the math node's coordinates — ProseMirror needs a real positional click
    const box = await mathExpressions.first().boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.waitForTimeout(200);

    // First panel: "Edit" and "Copy" buttons appear when node is selected
    const editButton = page.getByRole('button', { name: 'Edit', exact: true });
    await expect(editButton).toBeVisible({ timeout: 5_000 });
    await editButton.click();

    // Second panel: mode buttons "Edit Expression" and "Edit LaTeX"
    const editLatexButton = page.getByRole('button', { name: 'Edit LaTeX' });
    await expect(editLatexButton).toBeVisible({ timeout: 5_000 });
    await editLatexButton.click();

    // Find the input and modify it
    const input = page.locator('textarea[placeholder="Enter LaTeX code..."]');
    await expect(input).toBeVisible();
    await input.clear();
    await input.fill('y^2 + z^2');
    await page.keyboard.press('Enter');

    // The expression should update
    await expect(mathExpressions.first()).toBeVisible();
  });

  test('delete math expression', async ({ page }) => {
    const mathExpressions = page.locator('.math-expression-node');
    await expect(mathExpressions.first()).toBeVisible({ timeout: 5_000 });
    const count = await mathExpressions.count();

    const box = await mathExpressions.first().boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.waitForTimeout(200);
    await page.keyboard.press('Backspace');

    // There should be one fewer math expression
    await expect(mathExpressions).toHaveCount(count - 1);
  });

  test('LaTeX edit textarea auto-expands for long expressions', async ({
    page,
  }) => {
    const mathExpressions = page.locator('.math-expression-node');
    await expect(mathExpressions.first()).toBeVisible({ timeout: 5_000 });

    const box = await mathExpressions.first().boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.waitForTimeout(200);

    const editButton = page.getByRole('button', { name: 'Edit', exact: true });
    await expect(editButton).toBeVisible({ timeout: 5_000 });
    await editButton.click();

    const editLatexButton = page.getByRole('button', { name: 'Edit LaTeX' });
    await expect(editLatexButton).toBeVisible({ timeout: 5_000 });
    await editLatexButton.click();

    const textarea = page.locator(
      'textarea[placeholder="Enter LaTeX code..."]',
    );
    await expect(textarea).toBeVisible();

    // Measure baseline height with short content
    await textarea.fill('x^2');
    const shortBox = await textarea.boundingBox();
    expect(shortBox).not.toBeNull();
    const shortHeight = shortBox!.height;

    // Type a long LaTeX expression (200+ chars)
    const longLatex =
      '\\frac{\\partial^2 u}{\\partial t^2} = c^2 \\left( \\frac{\\partial^2 u}{\\partial x^2} + \\frac{\\partial^2 u}{\\partial y^2} + \\frac{\\partial^2 u}{\\partial z^2} \\right) + \\sum_{n=1}^{\\infty} a_n \\sin(n\\pi x)';
    await textarea.fill(longLatex);

    // Wait a frame for resize to take effect
    await page.waitForTimeout(100);

    const longBox = await textarea.boundingBox();
    expect(longBox).not.toBeNull();
    // The textarea should have grown taller
    expect(longBox!.height).toBeGreaterThan(shortHeight);

    // Verify max-height cap: textarea should not exceed 200px
    expect(longBox!.height).toBeLessThanOrEqual(210);

    // Press Escape to close without saving
    await page.keyboard.press('Escape');
  });

  test('math renders LTR inside RTL text', async ({ page }) => {
    test.skip(
      !!process.env.CI,
      'LaTeX AI conversion needs GOOGLE_GENERATIVE_AI_API_KEY in CI',
    );
    test.setTimeout(30_000);

    // Focus the editor
    const editor = page.locator('.ProseMirror').first();
    await editor.click();
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');

    // Type Hebrew text (RTL)
    await page.keyboard.type('זהו טקסט בעברית ');

    // Insert math with :{ trigger
    await page.keyboard.type(':');
    await page.keyboard.type('{');

    const mathInput = page.locator(
      'textarea[placeholder="Describe math in plain English..."]',
    );
    await expect(mathInput).toBeVisible({ timeout: 5_000 });
    await mathInput.fill('a in A');
    await page.keyboard.press('Enter');

    // Wait for math to render
    await expect(page.locator('.math-expression-node').last()).toBeVisible({
      timeout: 15_000,
    });

    // Verify the math node has LTR direction (math is always LTR)
    const mathNode = page.locator('.math-expression-node').last();
    const dir = await mathNode.evaluate((el) => getComputedStyle(el).direction);
    expect(dir).toBe('ltr');
  });
});
