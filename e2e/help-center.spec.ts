import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

/**
 * Help center (/help) + in-app Daymo help widget.
 *
 * The gallery is driven by the committed same-origin bundle
 * (public/help/manifest.json + posters), so these tests run identically in
 * CI and locally. Video files stream from Supabase Storage and are not
 * asserted on (playback is Daymo's own tested behavior). The AI ask flow
 * needs a Gemini key, so it is exercised by unit/manual testing, not here.
 */

test.describe('Help center page', () => {
  test('is public — loads logged out with hero, ask bar and popular questions', async ({
    page,
  }) => {
    await page.goto('/help');

    // No redirect to /login — /help is a public page.
    await expect(page).toHaveURL(/\/help$/);
    await expect(
      page.getByRole('heading', { name: 'How can we help?' }),
    ).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Ask' })).toBeVisible();
    await expect(
      page.getByRole('button', {
        name: 'How do I import my courses from Moodle?',
      }),
    ).toBeVisible();
  });

  test('gallery lists all 9 video guides with durations', async ({ page }) => {
    await page.goto('/help');

    // The sidebar library lists one row per guide, labelled "Video guides".
    await expect(page.locator('.daymo-help-side-grp-tx')).toHaveText(
      'Video guides',
    );
    const rows = page.locator('.daymo-help-lib-row');
    await expect(rows).toHaveCount(9);
    // Each row carries a duration (m:ss) in its label.
    await expect(rows.first()).toContainText(/\d+:\d{2}/);

    await expect(
      page
        .getByRole('button', { name: /Getting started with Typenote/ })
        .first(),
    ).toBeVisible();
    await expect(
      page
        .getByRole('button', { name: /Share a course with your study group/ })
        .first(),
    ).toBeVisible();
  });

  test('card opens the player modal with a step timeline, Escape closes it', async ({
    page,
  }) => {
    await page.goto('/help');

    await page
      .getByRole('button', { name: /Import from Moodle/ })
      .first()
      .click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('video')).toBeAttached();
    // Step timeline is built from the published manifest's narration steps.
    await expect(dialog.locator('.daymo-help-step').first()).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
  });

  test('sidebar collapses and can be reopened on desktop (regression)', async ({
    page,
  }) => {
    await page.goto('/help');

    const shell = page.locator('.daymo-help');
    const collapse = page.locator('.daymo-help-side-collapse');
    const reopen = page.locator('.daymo-help-topbar-menu');

    // Sidebar starts open; its own collapse toggle is the visible control.
    await expect(shell).toHaveAttribute('data-sidebar', 'open');
    await expect(collapse).toBeVisible();

    // Collapse it — the in-sidebar toggle is now clipped to zero width.
    await collapse.click();
    await expect(shell).toHaveAttribute('data-sidebar', 'closed');

    // Regression: a reopen control MUST remain visible on desktop. The only
    // reopen button used to be mobile-only (display:none above 760px), so once
    // collapsed there was no way back.
    await expect(reopen).toBeVisible();

    // And it actually restores the sidebar.
    await reopen.click();
    await expect(shell).toHaveAttribute('data-sidebar', 'open');
    await expect(collapse).toBeVisible();
  });

  test('serves the shared bundle: manifest + posters are same-origin', async ({
    request,
  }) => {
    const manifestRes = await request.get('/help/manifest.json');
    expect(manifestRes.ok()).toBe(true);
    const manifest = await manifestRes.json();
    expect(manifest.demos).toHaveLength(9);

    // Every poster the manifest references must be served by the app itself.
    for (const demo of manifest.demos) {
      expect(demo.posterUrl).toMatch(/^\/help\/posters\//);
      const posterRes = await request.get(demo.posterUrl);
      expect(posterRes.ok()).toBe(true);
    }
  });
});

test.describe('In-app help widget', () => {
  test('dashboard embeds the widget with its config endpoint live', async ({
    page,
  }) => {
    await login(page);

    // The widget mounts into a closed shadow root, so its internals are not
    // reachable by locators — assert the integration seams instead: the
    // host element mounts and both endpoints it boots from respond.
    await expect(page.locator('#daymo-widget-root')).toBeAttached();

    const configRes = await page.request.get(
      '/api/help/widget-config/typenote',
    );
    expect(configRes.ok()).toBe(true);
    const config = await configRes.json();
    expect(config.name).toBe('Typenote');
    expect(config.manifestUrl).toBe('/help/manifest.json');

    const scriptRes = await page.request.get('/daymo-widget.js');
    expect(scriptRes.ok()).toBe(true);
  });

  test('help bubble gets its distinct color from the widget config', async ({
    page,
  }) => {
    await login(page);

    // The bubble lives in a closed shadow root (unreachable by locators), but
    // the widget applies bubbleColor as an inline CSS var on the host element
    // in the light DOM — so the config→render seam is assertable. The bubble
    // icon (help "?") is verified at the config endpoint (route.test.ts) since
    // it only exists inside the closed root.
    const host = page.locator('#daymo-widget-root');
    await expect(host).toBeAttached();
    await expect
      .poll(
        () => host.evaluate((el) => el.style.getPropertyValue('--dw-bubble-bg')),
        { timeout: 10_000 },
      )
      .toBe('#0f766e');
  });

  test('widget is hidden on the document editor (Ask AI panel owns that corner)', async ({
    page,
  }) => {
    // The host div has no box of its own (the bubble is position:fixed
    // inside a closed shadow root), so visibility is asserted via the
    // host's computed display, which our route-aware style toggles.
    const hostDisplay = () =>
      page
        .locator('#daymo-widget-root')
        .evaluate((el) => getComputedStyle(el).display);

    await login(page);
    await expect(page.locator('#daymo-widget-root')).toBeAttached();
    expect(await hostDisplay()).not.toBe('none');

    // Open a document — the editor's own Ask AI panel lives bottom-right,
    // so the help bubble must not cover it (regression: the bubble
    // intercepted clicks on the AI panel's citation buttons).
    await page.getByRole('button', { name: 'New Document' }).click();
    const titleInput = page.getByLabel('Title');
    await titleInput.clear();
    await titleInput.fill(`Widget overlap check ${Date.now()}`);
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    // Generous timeout: reaching the editor here means the createDocument
    // server action round-trips AND the heavy /dashboard/documents/[docId]
    // route (TipTap + KaTeX) compiles on demand. Under the local suite's
    // parallel workers (and hosted-Supabase latency) that first cold compile
    // can take well over 10s. CI runs workers=1 + retries, so it never sees
    // this — but locally the tight timeout flaked. We're not asserting speed
    // here; this is just setup to reach the editor.
    await expect(page).toHaveURL(/\/dashboard\/documents\//, {
      timeout: 30_000,
    });

    await expect.poll(hostDisplay, { timeout: 20_000 }).toBe('none');

    // Back on the dashboard the bubble returns.
    await page.goto('/dashboard');
    await expect.poll(hostDisplay, { timeout: 10_000 }).not.toBe('none');
  });

  test('sidebar Help link navigates to the help center', async ({ page }) => {
    await login(page);

    await page.getByRole('link', { name: 'Help' }).click();
    await expect(page).toHaveURL(/\/help$/);
    await expect(
      page.getByRole('heading', { name: 'How can we help?' }),
    ).toBeVisible();
  });
});
