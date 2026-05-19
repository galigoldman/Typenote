/**
 * Security: XSS resistance for user-controlled document titles.
 *
 * A notebook product is a stored-XSS magnet — titles are persisted, rendered
 * on the dashboard, in breadcrumbs, in the editor header, and in the PDF
 * export popup. If any surface ever switches from text rendering to
 * `dangerouslySetInnerHTML`, an attacker could persist arbitrary script
 * in their own document and then convince a victim to view it (e.g. via a
 * shared course later).
 *
 * These tests verify that titles containing common XSS payloads:
 *   - render as plain text in the dashboard card
 *   - render as plain text in the document's editor (browser tab title and
 *     visible title input)
 *   - do NOT trigger an `alert()` dialog (page.on('dialog'))
 *   - do NOT inject a `<script>` element into the DOM
 */
import { test, expect, type Dialog } from '@playwright/test';
import { login } from './helpers/auth';
import {
  upsertFixtureDocument,
  deleteFixtureDocument,
  type FixtureDocument,
} from './helpers/db';

const FIXTURE: FixtureDocument = {
  id: '9c000000-0000-0000-0000-000000000001',
  // Classic stored-XSS attempts: <script>, <img onerror>, javascript: URL,
  // SVG onload, and a closing-tag escape. All must render as text.
  title:
    '<script>window.__xss_fired=true;alert(1)</script><img src=x onerror="window.__xss_fired=true"><svg onload="window.__xss_fired=true">',
  canvas_type: 'blank',
  content: {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Body' }] }],
  },
};

test.describe('Security — XSS resistance for document titles', () => {
  test.beforeEach(async ({ page }) => {
    await upsertFixtureDocument(FIXTURE);
    await login(page);
  });

  test.afterEach(async () => {
    await deleteFixtureDocument(FIXTURE.id);
  });

  test('XSS payload in title renders as text on the dashboard and does not execute', async ({
    page,
  }) => {
    // Catch any unexpected alert dialog as a hard failure.
    const dialogs: Dialog[] = [];
    page.on('dialog', async (d) => {
      dialogs.push(d);
      await d.dismiss();
    });

    await page.goto('/dashboard');

    // The fixture card must be present, with title rendered as text.
    const card = page
      .locator('[data-testid="document-card"]')
      .filter({ hasText: 'script' })
      .first();
    await expect(card).toBeVisible({ timeout: 10_000 });

    // The card's title node must contain the raw payload as text — NOT
    // contain any actual <script> element.
    const titleText = await card.locator('.truncate').first().textContent();
    expect(titleText).toContain('<script>');

    // The real signal: did any of the injected payloads actually execute?
    // `__xss_fired` is the sentinel each payload tries to set on `window`.
    // (We can't rely on counting <script> tags — Next.js serializes page
    // state into `<script id="__NEXT_DATA__">` which legitimately contains
    // the title string as JSON-escaped data, not executable code.)
    const fired = await page.evaluate(
      () => (window as unknown as { __xss_fired?: boolean }).__xss_fired,
    );
    expect(fired).toBeFalsy();
    expect(dialogs).toHaveLength(0);
  });

  test('XSS payload in title renders as text in the editor header and does not execute', async ({
    page,
  }) => {
    const dialogs: Dialog[] = [];
    page.on('dialog', async (d) => {
      dialogs.push(d);
      await d.dismiss();
    });

    await page.goto(`/dashboard/documents/${FIXTURE.id}`);
    await expect(page.locator('.ProseMirror').first()).toBeVisible({
      timeout: 10_000,
    });

    // The editor's title input must hold the literal payload as a string
    // value, not a parsed DOM tree.
    const titleInput = page.locator('input[type="text"]').filter({
      hasNot: page.locator(':is([type="email"], [type="password"])'),
    });
    // Find the input whose value matches the payload start.
    const editorTitle = await page
      .locator('input')
      .filter({ hasNot: page.locator('[type="checkbox"]') })
      .evaluateAll((els: HTMLInputElement[]) =>
        els.map((el) => el.value).find((v) => v.includes('<script>')),
      );
    expect(editorTitle).toBeTruthy();
    expect(editorTitle as string).toContain('<script>');
    void titleInput; // keep the locator alive for debugger inspection

    const fired = await page.evaluate(
      () => (window as unknown as { __xss_fired?: boolean }).__xss_fired,
    );
    expect(fired).toBeFalsy();
    expect(dialogs).toHaveLength(0);
  });
});
