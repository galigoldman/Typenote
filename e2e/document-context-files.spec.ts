import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

const COURSE_ID = '30000000-0000-0000-0000-000000000001';
const COURSE_URL = `/dashboard/courses/${COURSE_ID}`;

// A seeded course_material id — used in the mocked AI citation response.
const SEEDED_MATERIAL_ID = '50000000-0000-0000-0000-000000000001';

// ──────────────────────────────────────────────────────────────────────────────
// Helper: navigate to the course page, open the Create Document dialog, and
// submit it to land on a new document page.  Returns after the URL has changed.
// ──────────────────────────────────────────────────────────────────────────────
async function openNewCourseDocument(page: Parameters<typeof login>[0]) {
  await page.goto(COURSE_URL);
  await expect(page).toHaveURL(/\/dashboard\/courses\//, {
    timeout: 15_000,
  });

  // Click "New Document" button — this opens the CreateDocumentDialog
  await page.getByRole('button', { name: 'New Document' }).click({
    timeout: 10_000,
  });

  // Wait for the dialog title to appear
  await expect(page.getByText('Create New Document')).toBeVisible({
    timeout: 8_000,
  });

  // Click the "Create" submit button (exact match to avoid "Creating...")
  await page
    .getByRole('button', { name: 'Create', exact: true })
    .click({ timeout: 5_000 });

  // Wait for navigation to the new document page
  await expect(page).toHaveURL(/\/dashboard\/documents\//, { timeout: 15_000 });
}

// ──────────────────────────────────────────────────────────────────────────────
// Test 1: "Start Homework" is gone from the course page
// ──────────────────────────────────────────────────────────────────────────────
test('Start Homework button is not present on the course page', async ({
  page,
}) => {
  await login(page);
  await page.goto(COURSE_URL);

  await expect(page.getByRole('button', { name: 'New Document' })).toBeVisible({
    timeout: 15_000,
  });

  await expect(
    page.getByRole('button', { name: 'Start Homework' }),
  ).toHaveCount(0);
});

// ──────────────────────────────────────────────────────────────────────────────
// Test 2: Attach and detach a context file
// ──────────────────────────────────────────────────────────────────────────────
test('attach and detach a context file on a course document', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await login(page);
  await openNewCourseDocument(page);

  // The floating context-files toggle button should be visible
  const toggle = page.getByTestId('context-files-toggle');
  await expect(toggle).toBeVisible({ timeout: 10_000 });
  await toggle.click();

  // Panel opens
  await expect(page.getByTestId('context-files-panel')).toBeVisible({
    timeout: 5_000,
  });

  // Click "Add files"
  await page.getByTestId('context-files-add').click({ timeout: 5_000 });

  // Picker candidates should appear (seeded course has course_materials)
  const firstCandidate = page.getByTestId('context-files-candidate').first();
  await expect(firstCandidate).toBeVisible({ timeout: 10_000 });
  await firstCandidate.click();

  // At least one attached file item should now appear
  await expect(page.getByTestId('context-file-item')).toHaveCount(1, {
    timeout: 10_000,
  });

  // Remove the attached file — the button has aria-label="Remove <name>"
  const removeBtn = page.getByRole('button', { name: /Remove/i }).first();
  // The remove button is only visible on hover; force the click.
  await removeBtn.click({ force: true, timeout: 5_000 });

  // No more attached items
  await expect(page.getByTestId('context-file-item')).toHaveCount(0, {
    timeout: 10_000,
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Test 3: Open an attached file in the viewer
// ──────────────────────────────────────────────────────────────────────────────
test('click an attached context file item opens the file viewer', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await login(page);
  await openNewCourseDocument(page);

  // Open the context files panel
  const toggle = page.getByTestId('context-files-toggle');
  await expect(toggle).toBeVisible({ timeout: 10_000 });
  await toggle.click();

  await expect(page.getByTestId('context-files-panel')).toBeVisible({
    timeout: 5_000,
  });

  // Add a file
  await page.getByTestId('context-files-add').click({ timeout: 5_000 });
  const firstCandidate = page.getByTestId('context-files-candidate').first();
  await expect(firstCandidate).toBeVisible({ timeout: 10_000 });
  await firstCandidate.click();

  // Close the picker first so the item is unobstructed
  await page.getByRole('button', { name: 'Done' }).click({ timeout: 5_000 });

  // Wait for the attached item to appear
  const attachedItem = page.getByTestId('context-file-item').first();
  await expect(attachedItem).toBeVisible({ timeout: 10_000 });

  // Click the attached item to open the viewer.
  // dispatchEvent fires the React onClick directly, bypassing Playwright's strict
  // actionability check (the item can be just outside the visible area at the
  // default headless viewport). This is a test-runner workaround, not a UI bug:
  // on desktop (>=lg) the panel is a static sidebar with no overlapping element.
  await attachedItem.dispatchEvent('click');

  // Viewer opens — seeded files have no actual storage object so it may show
  // a loading spinner or an error state, but the viewer chrome must be visible.
  await expect(page.getByTestId('file-viewer')).toBeVisible({
    timeout: 10_000,
  });

  // Close the viewer
  await page.getByRole('button', { name: 'Close viewer' }).click({
    timeout: 5_000,
  });

  await expect(page.getByTestId('file-viewer')).toHaveCount(0, {
    timeout: 5_000,
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Test 4: AI citation opens the file viewer (mocked AI API)
// ──────────────────────────────────────────────────────────────────────────────
test('AI citation button opens the file viewer (mocked AI response)', async ({
  page,
}) => {
  test.setTimeout(60_000);

  // Mock the AI API to return a stable SSE response with a citation.
  const sseBody = [
    `data: ${JSON.stringify({
      type: 'sources',
      sources: [
        {
          sourceType: 'course_material',
          sourceId: SEEDED_MATERIAL_ID,
          sourceName: 'HW3.pdf',
          pageRange: 'p. 2',
          signedUrl: null,
        },
      ],
      model: 'flash',
      contextFilesUsed: true,
    })}`,
    '',
    `data: ${JSON.stringify({ type: 'text', text: 'Question 3 asks…' })}`,
    '',
    `data: ${JSON.stringify({ type: 'done' })}`,
    '',
  ].join('\n');

  await page.route('**/api/ai/ask', async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
      body: sseBody,
    });
  });

  await login(page);
  await openNewCourseDocument(page);

  // Open AI chat
  const aiButton = page.getByRole('button', { name: 'Open AI chat' });
  await expect(aiButton).toBeVisible({ timeout: 10_000 });
  await aiButton.click();

  // Chat panel open — fill in a question and submit
  const chatInput = page.locator(
    'input[placeholder*="Ask anything about your course materials"]',
  );
  await expect(chatInput).toBeVisible({ timeout: 8_000 });
  await chatInput.fill('What does question 3 ask?');

  // Submit via the form's submit button (Send icon button)
  await page
    .locator('form')
    .filter({ has: chatInput })
    .locator('[type="submit"]')
    .click({ timeout: 5_000 });

  // Citation button should appear after the mocked response
  const citation = page.getByTestId('ai-citation').first();
  await expect(citation).toBeVisible({ timeout: 15_000 });

  // Click the citation to open the viewer
  await citation.click();

  // File viewer should open
  await expect(page.getByTestId('file-viewer')).toBeVisible({
    timeout: 10_000,
  });
});
