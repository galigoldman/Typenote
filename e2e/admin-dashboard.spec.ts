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

    // Seeded cost for the test user is $1.85 (see admin-usage seed).
    // $1.85 appears in both the "Est. cost" summary card and the user's table
    // row (the test user is the only one with activity, so the total equals the
    // row), which trips strict mode — scope to the table cell for the per-user
    // value while still asserting the real seeded $1.85.
    await expect(page.getByRole('cell', { name: '$1.85' })).toBeVisible();
  });

  test('non-admin is blocked from /admin (404)', async ({ page }) => {
    await login(page); // seeded non-admin test@typenote.dev
    const response = await page.goto('/admin');
    expect(response?.status()).toBe(404);
    await expect(page.getByRole('heading', { name: 'AI Usage' })).toHaveCount(
      0,
    );
  });
});
