import { test, expect, type Page } from '@playwright/test';
import { loginAs } from './helpers/auth';

const OWNER = { email: 'test@typenote.dev', password: 'Test1234' };
const MEMBER = { email: 'test-b@typenote.dev', password: 'Test1234' };

async function createCourse(page: Page, name: string) {
  await page.getByRole('button', { name: 'New Course' }).click();
  await page.getByLabel('Name').fill(name);
  await page.getByRole('button', { name: 'Create Course' }).click();
  await page.getByText(name).first().click();
  await expect(page).toHaveURL(/\/dashboard\/courses\//, { timeout: 10_000 });
}

async function getShareUrl(
  page: Page,
  role: 'viewer' | 'contributor',
): Promise<string> {
  // exact:true so we don't match sidebar course cards whose names contain
  // "Share" (e.g. a leftover "Share E2E ..." course) via substring matching.
  await page.getByRole('button', { name: 'Share', exact: true }).click();
  await page
    .getByRole('button', { name: new RegExp(`create ${role} link`, 'i') })
    .click();
  const input = page.getByRole('dialog').getByRole('textbox').first();
  await expect(input).toBeVisible({ timeout: 10_000 });
  await expect(input).toHaveValue(/\/share\//, { timeout: 10_000 });
  return await input.inputValue();
}

test.describe('Course sharing', () => {
  test('contributor link: member joins, sees materials, uploads; owner sees it', async ({
    browser,
  }) => {
    test.setTimeout(90_000);
    const ownerCtx = await browser.newContext();
    const ownerPage = await ownerCtx.newPage();
    await loginAs(ownerPage, OWNER.email, OWNER.password);
    const courseName = `Share E2E ${Date.now()}`;
    await createCourse(ownerPage, courseName);

    const ownerFile = ownerPage.locator('input[type="file"]').first();
    await ownerFile.setInputFiles({
      name: `owner-${Date.now()}.pdf`,
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 owner'),
    });
    await expect(ownerPage.getByText('File imported')).toBeVisible({
      timeout: 20_000,
    });

    const url = await getShareUrl(ownerPage, 'contributor');

    const memberCtx = await browser.newContext();
    const memberPage = await memberCtx.newPage();
    await loginAs(memberPage, MEMBER.email, MEMBER.password);
    await memberPage.goto(url);
    await expect(memberPage).toHaveURL(/\/dashboard\/courses\//, {
      timeout: 15_000,
    });
    await expect(
      memberPage.getByRole('heading', { name: courseName }),
    ).toBeVisible({ timeout: 10_000 });

    // member (contributor) can upload
    const memberFile = memberPage.locator('input[type="file"]').first();
    await memberFile.setInputFiles({
      name: `member-${Date.now()}.pdf`,
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 member'),
    });
    await expect(memberPage.getByText('File imported')).toBeVisible({
      timeout: 20_000,
    });

    await ownerCtx.close();
    await memberCtx.close();
  });

  test('viewer link: member cannot upload', async ({ browser }) => {
    test.setTimeout(90_000);
    const ownerCtx = await browser.newContext();
    const ownerPage = await ownerCtx.newPage();
    await loginAs(ownerPage, OWNER.email, OWNER.password);
    const courseName = `Viewer E2E ${Date.now()}`;
    await createCourse(ownerPage, courseName);
    const url = await getShareUrl(ownerPage, 'viewer');

    const memberCtx = await browser.newContext();
    const memberPage = await memberCtx.newPage();
    await loginAs(memberPage, MEMBER.email, MEMBER.password);
    await memberPage.goto(url);
    await expect(
      memberPage.getByRole('heading', { name: courseName }),
    ).toBeVisible({ timeout: 15_000 });

    await expect(
      memberPage.getByRole('button', { name: 'Import File', exact: true }),
    ).toHaveCount(0);

    await ownerCtx.close();
    await memberCtx.close();
  });

  test('leave: member removes course from list; course persists for owner', async ({
    browser,
  }) => {
    test.setTimeout(90_000);
    const ownerCtx = await browser.newContext();
    const ownerPage = await ownerCtx.newPage();
    await loginAs(ownerPage, OWNER.email, OWNER.password);
    const courseName = `Leave E2E ${Date.now()}`;
    await createCourse(ownerPage, courseName);
    const url = await getShareUrl(ownerPage, 'viewer');

    const memberCtx = await browser.newContext();
    const memberPage = await memberCtx.newPage();
    await loginAs(memberPage, MEMBER.email, MEMBER.password);
    await memberPage.goto(url);
    await expect(
      memberPage.getByRole('heading', { name: courseName }),
    ).toBeVisible({ timeout: 15_000 });

    await memberPage.goto('/dashboard');
    await expect(memberPage.getByText('Shared with me')).toBeVisible({
      timeout: 10_000,
    });
    const card = memberPage.locator('[data-testid="course-card"]', {
      hasText: courseName,
    });
    memberPage.on('dialog', (d) => d.accept());
    await card.getByTestId('course-menu-trigger').click();
    await memberPage.getByText('Remove from my list').click();
    // The shared-course card disappears from the dashboard. (Scope to
    // course-card so we don't also count the sidebar tree entry, which is a
    // separate component.)
    await expect(
      memberPage.locator('[data-testid="course-card"]', {
        hasText: courseName,
      }),
    ).toHaveCount(0, { timeout: 10_000 });

    await ownerPage.goto('/dashboard');
    await expect(ownerPage.getByText(courseName).first()).toBeVisible({
      timeout: 10_000,
    });

    await ownerCtx.close();
    await memberCtx.close();
  });
});
