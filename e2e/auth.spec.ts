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

  test('signup page shows only Google button (no email/password form)', async ({
    page,
  }) => {
    await page.goto('/signup');

    // Google signup button should be visible
    await expect(
      page.getByRole('button', { name: /sign up with google/i }),
    ).toBeVisible();

    // Email/password form fields should NOT exist
    await expect(page.getByLabel('Email')).not.toBeVisible();
    await expect(page.getByLabel('Password')).not.toBeVisible();
    await expect(page.getByLabel('Display Name')).not.toBeVisible();
  });

  test('login page still shows both email/password and Google options', async ({
    page,
  }) => {
    await page.goto('/login');

    // Email/password form should be present
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();

    // Google button should also be present
    await expect(page.getByRole('button', { name: /google/i })).toBeVisible();
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
