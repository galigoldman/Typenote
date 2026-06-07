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

    await expect(
      page.getByRole('heading', { name: 'Video guides' }),
    ).toBeVisible();
    const cards = page.locator('.daymo-help-card');
    await expect(cards).toHaveCount(9);
    await expect(
      page.getByRole('button', { name: /Getting started with Typenote/ }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', {
        name: /Share a course with your study group/,
      }),
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

  test('sidebar Help link navigates to the help center', async ({ page }) => {
    await login(page);

    await page.getByRole('link', { name: 'Help' }).click();
    await expect(page).toHaveURL(/\/help$/);
    await expect(
      page.getByRole('heading', { name: 'How can we help?' }),
    ).toBeVisible();
  });
});
