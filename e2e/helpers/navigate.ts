import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

/**
 * Navigate to the seeded "Introduction to CS" course from the dashboard.
 * Assumes the user is already logged in and on the dashboard.
 */
export async function goToSeededCourse(page: Page) {
  // The seeded course "Introduction to CS" is at root level
  // Use a text match that works even if the name is truncated
  const courseLink = page.getByText('Introduction to CS').first();
  await expect(courseLink).toBeVisible({ timeout: 10_000 });
  await courseLink.click();

  await expect(page).toHaveURL(/\/dashboard\/courses\//, {
    timeout: 10_000,
  });
}
