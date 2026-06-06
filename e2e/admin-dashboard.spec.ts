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

    // Full roster: zero-activity users appear too. The admin account has no
    // usage in 2099-01 but must still be listed (sorted below active users).
    await expect(page.getByRole('cell', { name: ADMIN_EMAIL })).toBeVisible();

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

  test('admin drills into a user: month → day → per-query + by-document', async ({
    page,
  }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto('/admin?month=2099-01');

    // Open the test user's drill-down via the roster link.
    await page.getByRole('link', { name: 'test@typenote.dev' }).click();
    await expect(page).toHaveURL(/\/admin\/users\//);
    await expect(
      page.getByRole('heading', { name: 'test@typenote.dev' }),
    ).toBeVisible();

    // By-month row for 2099-01 is present; drill in.
    // Scope to the first table link to avoid any ambiguity if the month appears
    // elsewhere on the page.
    await page.getByRole('link', { name: '2099-01' }).first().click();
    await expect(page).toHaveURL(/month=2099-01/);

    // By-day rows appear; drill into 2099-01-06 (has 2 events).
    await page.getByRole('link', { name: '2099-01-06' }).click();
    await expect(page).toHaveURL(/day=2099-01-06/);

    // Per-query list shows the embedding model row (query_type column).
    await expect(page.getByText('embedding').first()).toBeVisible();

    // By-document section present.
    await expect(
      page.getByRole('heading', { name: 'Questions by document' }),
    ).toBeVisible();
  });

  test('non-admin is blocked from a user drill-down page (404)', async ({
    page,
  }) => {
    await login(page);
    const res = await page.goto(
      '/admin/users/ac3be77d-4566-406c-9ac0-7c410634ad41',
    );
    expect(res?.status()).toBe(404);
  });
});
