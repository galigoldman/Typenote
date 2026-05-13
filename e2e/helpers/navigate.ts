import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

/**
 * Navigate to the seeded "Introduction to CS" course from the dashboard.
 *
 * Assumes the user is already logged in and on the dashboard. This helper
 * waits for the course-page heading to render before returning so the
 * caller can interact with course-page elements without hitting a
 * server-component auth-propagation race.
 *
 * If the course page renders unauthenticated (404 or empty) on the first
 * navigation — a known CI race — we reload once and retry the assertion.
 */
export async function goToSeededCourse(page: Page) {
  const courseLink = page.getByText('Introduction to CS').first();
  await expect(courseLink).toBeVisible({ timeout: 10_000 });
  await courseLink.click();

  await expect(page).toHaveURL(/\/dashboard\/courses\//, { timeout: 10_000 });

  // Wait for a course-page-only element to prove the SSR rendered the
  // authenticated view (not a notFound or unauthed redirect).
  const courseHeading = page.getByRole('heading', {
    name: 'Introduction to CS',
  });
  try {
    await expect(courseHeading).toBeVisible({ timeout: 8_000 });
  } catch {
    // Server-component auth cookie race: reload once and retry.
    await page.reload();
    await expect(courseHeading).toBeVisible({ timeout: 10_000 });
  }
}
