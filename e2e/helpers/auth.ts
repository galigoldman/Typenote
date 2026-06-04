import type { Page } from '@playwright/test';

/**
 * Log in as the seeded test user.
 *
 * Uses TEST_USER_EMAIL / TEST_USER_PASSWORD env vars if set,
 * otherwise falls back to the default seeded credentials.
 */
export async function login(page: Page) {
  const email = process.env.TEST_USER_EMAIL ?? 'test@typenote.dev';
  const password = process.env.TEST_USER_PASSWORD ?? 'Test1234';

  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL('**/dashboard**');
}

export async function loginAs(
  page: import('@playwright/test').Page,
  email: string,
  password: string,
) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL('**/dashboard**');
}
