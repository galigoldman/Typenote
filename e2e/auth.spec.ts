import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

test.describe('Auth', () => {
  test('log in with valid credentials redirects to dashboard', async ({
    page,
  }) => {
    await login(page);

    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByText('New Document')).toBeVisible();
  });

  test('log in with wrong password shows error', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill('test@typenote.dev');
    await page.getByLabel('Password').fill('WrongPassword123');
    await page.getByRole('button', { name: 'Sign in' }).click();

    // Error message should appear
    await expect(page.locator('[role="alert"]')).toBeVisible();

    // Should NOT reach the dashboard
    await expect(page).not.toHaveURL(/\/dashboard/);
  });

  test('sign up with valid details redirects to dashboard', async ({
    page,
  }) => {
    const uniqueEmail = `test-signup-${Date.now()}@typenote.dev`;

    await page.goto('/signup');
    await page.getByLabel('Display Name').fill('E2E Test User');
    await page.getByLabel('Email').fill(uniqueEmail);
    await page.getByLabel('Password').fill('TestPassword123');
    await page.getByRole('button', { name: 'Sign up' }).click();

    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10_000 });
  });

  test('sign up with invalid email shows error', async ({ page }) => {
    await page.goto('/signup');
    await page.getByLabel('Display Name').fill('Bad Email User');
    await page.getByLabel('Email').fill('not-an-email');
    await page.getByLabel('Password').fill('TestPassword123');
    await page.getByRole('button', { name: 'Sign up' }).click();

    // The browser's built-in validation should prevent submission,
    // or Supabase returns an error. Either way, we should NOT reach dashboard.
    await page.waitForTimeout(1000);
    await expect(page).toHaveURL(/\/signup/);
  });

  test('logout returns to login page', async ({ page }) => {
    await login(page);
    await expect(page).toHaveURL(/\/dashboard/);

    // Click "Sign out" button in the sidebar
    await page.getByRole('button', { name: /sign out/i }).click();

    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });

    // Trying to access dashboard should redirect back to login
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
  });

  test('unauthenticated user is redirected to login', async ({ page }) => {
    await page.goto('/dashboard');

    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
  });

  test('forgot password shows confirmation message', async ({ page }) => {
    await page.goto('/forgot-password');

    await page.getByLabel('Email').fill('test@typenote.dev');
    await page.getByRole('button', { name: 'Send reset link' }).click();

    // After submission, the page should show "Check your email"
    await expect(page.getByText('Check your email')).toBeVisible({
      timeout: 10_000,
    });
  });
});
