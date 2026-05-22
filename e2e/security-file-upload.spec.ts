/**
 * Security: file-upload validation.
 *
 * The course-material upload pipeline validates client-side via
 * `useFileUpload` (`src/hooks/use-file-upload.ts`) — MIME-type allowlist
 * (PDF only by default) and a 50 MB cap. Bypassing either of these would
 * let a user push arbitrary binaries into Supabase Storage under their
 * own user-id prefix, where they could be served back to the browser
 * with `application/pdf` content-type at view-time, or simply exhaust
 * the free-tier storage quota.
 *
 * These tests exercise the validation at the browser level, not the
 * hook unit. The hook unit-test (`use-file-upload.test.ts`) covers the
 * pure validation function in isolation — but if the consuming component
 * forgets to render the error or call `validateFile`, the unit test
 * passes and the bug ships. This E2E test guards the wiring.
 */
import { test, expect } from '@playwright/test';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { login } from './helpers/auth';
import { goToSeededCourse } from './helpers/navigate';

test.describe('Security — file upload validation', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await goToSeededCourse(page);
    await expect(page.getByRole('button', { name: 'Import File' })).toBeVisible(
      { timeout: 15_000 },
    );
  });

  test('rejects a non-PDF file by MIME type — error visible, no toast success', async ({
    page,
  }) => {
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles({
      name: 'malicious.exe',
      mimeType: 'application/octet-stream',
      // Real PE-header prefix to make the file look "executable-ish".
      // The validation runs on file.type (MIME), not on the magic bytes,
      // so contents are irrelevant — but real-looking bytes make the
      // test scenario closer to an actual attack attempt.
      buffer: Buffer.from('MZ\x90\x00\x03\x00\x00\x00fake-binary'),
    });

    // The hook surfaces validation errors as toast.error(...) AND/OR an
    // inline <p class="text-destructive">. The exact text matches the
    // hook's `Accepted file types: ...` template. Either surface must
    // contain that string.
    // Error renders both inline (<p class="text-destructive">) AND as a
    // Sonner toast. Either surface is acceptable — assert on the first
    // match so strict-mode doesn't complain about the duplicate.
    await expect(page.getByText(/Accepted file types:/i).first()).toBeVisible({
      timeout: 5_000,
    });

    // No success toast should ever appear for a rejected file.
    await expect(page.getByText('File imported')).not.toBeVisible({
      timeout: 1_000,
    });
  });

  test('rejects a file larger than 50 MB — error visible, no toast success', async ({
    page,
  }) => {
    test.setTimeout(45_000);

    // Playwright's `setInputFiles({ buffer })` caps inline payloads at
    // 50 MB. To exercise the >50 MB branch we write the bytes to disk
    // first and pass the path. Clean up after.
    const tmpPath = join(tmpdir(), `typenote-oversized-${Date.now()}.pdf`);
    const oversized = Buffer.alloc(50 * 1024 * 1024 + 1, 0x20);
    await fs.writeFile(tmpPath, oversized);

    try {
      const fileInput = page.locator('input[type="file"]').first();
      await fileInput.setInputFiles(tmpPath);

      await expect(page.getByText(/under 50MB/i).first()).toBeVisible({
        timeout: 5_000,
      });

      await expect(page.getByText('File imported')).not.toBeVisible({
        timeout: 1_000,
      });
    } finally {
      await fs.unlink(tmpPath).catch(() => {
        /* best-effort cleanup */
      });
    }
  });

  test('rejects a double-extension file whose MIME is not application/pdf', async ({
    page,
  }) => {
    // Classic disguise attempt: `report.pdf.exe`. Browser sets file.type
    // from the OS MIME mapping; on a controlled fixture we pass the MIME
    // explicitly. The hook validates `file.type`, NOT the name, so the
    // .pdf in the middle does not save the file.
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles({
      name: 'report.pdf.exe',
      mimeType: 'application/x-msdownload',
      buffer: Buffer.from('MZ\x90fake'),
    });

    // Error renders both inline (<p class="text-destructive">) AND as a
    // Sonner toast. Either surface is acceptable — assert on the first
    // match so strict-mode doesn't complain about the duplicate.
    await expect(page.getByText(/Accepted file types:/i).first()).toBeVisible({
      timeout: 5_000,
    });
  });
});
