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

  test('shows richer KPIs and a month-wide daily-totals trend', async ({
    page,
  }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto('/admin?month=2099-01');

    // New KPI cards beyond chat/latex.
    await expect(page.getByText('Active users')).toBeVisible();
    await expect(page.getByText('Total queries')).toBeVisible();
    await expect(page.getByText('Embeddings')).toBeVisible();

    // Daily trend section lists both seeded days (06 has 2 events, 05 has 1).
    await expect(
      page.getByRole('heading', { name: 'Daily totals — 2099-01' }),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: '2099-01-06' })).toBeVisible();
    await expect(page.getByRole('link', { name: '2099-01-05' })).toBeVisible();
  });

  test('day picker / trend link scopes the roster to a single day', async ({
    page,
  }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto('/admin?month=2099-01');

    const roster = page.getByTestId('usage-roster');
    const testRow = roster
      .getByRole('row')
      .filter({ has: page.getByRole('link', { name: 'test@typenote.dev' }) });

    // Month view: test user's full-month cost is $1.95.
    await expect(testRow).toContainText('$1.95');

    // Scope to 2099-01-06 via the daily-trend link.
    await page.getByRole('link', { name: '2099-01-06' }).click();
    await expect(page).toHaveURL(/day=2099-01-06/);

    // That day's slice for the test user is $1.02 (chat $0.62 + embedding $0.40).
    await expect(testRow).toContainText('$1.02');
    await expect(testRow).not.toContainText('$1.95');

    // The day picker reflects the selection.
    await expect(page.getByLabel('Usage day')).toHaveValue('2099-01-06');
  });

  test('roster columns sort on header click', async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto('/admin?month=2099-01');

    const roster = page.getByTestId('usage-roster');
    const firstRow = roster.locator('tbody tr').first();

    // Default sort is cost desc → the only active user (test@) is on top.
    await expect(firstRow).toContainText('test@typenote.dev');

    // Click "Est. cost" header → toggles to ascending → a $0.00 user surfaces.
    await roster.getByRole('button', { name: /Est\. cost/ }).click();
    const costHeader = roster.getByRole('columnheader', { name: /Est\. cost/ });
    await expect(costHeader).toHaveAttribute('aria-sort', 'ascending');
    await expect(firstRow).toContainText('$0.00');
    await expect(firstRow).not.toContainText('test@typenote.dev');

    // Filter box narrows the roster to the matching user.
    await page.getByLabel('Filter users').fill('test@typenote');
    await expect(roster.locator('tbody tr')).toHaveCount(1);
    await expect(roster.locator('tbody tr').first()).toContainText(
      'test@typenote.dev',
    );
  });
});
