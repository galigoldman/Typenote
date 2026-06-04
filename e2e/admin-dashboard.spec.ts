import { test, expect } from '@playwright/test';
import { login, loginAs } from './helpers/auth';

const ADMIN_EMAIL = process.env.ADMIN_USER_EMAIL ?? 'admin@typenote.dev';
const ADMIN_PASSWORD = process.env.ADMIN_USER_PASSWORD ?? 'Admin1234';

test.describe('Admin AI Usage Dashboard', () => {
  test('admin sees seeded usage for a given month', async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);

    // Navigate to the deterministic seeded month (2099-01).
    await page.goto('/admin?month=2099-01');

    await expect(page.getByRole('heading', { name: 'AI Usage' })).toBeVisible();

    // Seeded test user row is present with its email.
    await expect(page.getByText('test@typenote.dev')).toBeVisible();

    // Summary cards present.
    await expect(page.getByText('Chat queries')).toBeVisible();
    await expect(page.getByText('LaTeX queries')).toBeVisible();

    // Seeded cost for the test user is $1.95 (see admin-usage seed:
    // flash 0.30+1.25 + embedding 2M*0.20=0.40). $1.95 appears in both the
    // "Est. cost" summary card and the user's table row (the test user is the
    // only one with activity, so the total equals the row), which trips strict
    // mode — scope to the table cell for the per-user value.
    await expect(page.getByRole('cell', { name: '$1.95' })).toBeVisible();
  });

  test('admin sees the AI Usage nav link and can reach the dashboard from it', async ({
    page,
  }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    // login lands on /dashboard; the admin-only sidebar link is present.
    const navLink = page.getByRole('link', { name: 'AI Usage' });
    await expect(navLink).toBeVisible();
    await navLink.click();
    await expect(page).toHaveURL(/\/admin/);
    await expect(page.getByRole('heading', { name: 'AI Usage' })).toBeVisible();
  });

  test('non-admin is blocked from /admin (404) and has no nav link', async ({
    page,
  }) => {
    await login(page); // seeded non-admin test@typenote.dev
    // The admin-only nav link must not render for non-admins.
    await expect(page.getByRole('link', { name: 'AI Usage' })).toHaveCount(0);

    const response = await page.goto('/admin');
    expect(response?.status()).toBe(404);
    await expect(page.getByRole('heading', { name: 'AI Usage' })).toHaveCount(
      0,
    );
  });
});
