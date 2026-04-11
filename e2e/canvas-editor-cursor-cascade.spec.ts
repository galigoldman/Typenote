import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';
import {
  createDocumentWithNearFullPages,
  waitForCascadeSettled,
  setCursorAtEndOfPage,
  setCursorInMiddleOfPage,
  getActivePageId,
  pageCount,
} from './helpers/canvas-fill-pages';

/**
 * E2E tests for the cursor-cascade fix — follow-up to issue #118.
 *
 * Each test reproduces one of the bugs described in
 * specs/035-fix-118-cursor-cascade/spec.md and then asserts the
 * post-fix behaviour described in that spec. Tests are written FIRST
 * (per Constitution Principle II) and must FAIL on the branch state
 * BEFORE the US1/US2 implementation lands.
 *
 * All tests use the shared canvas-fill-pages helper to build a
 * deterministic multi-page document via a synthetic ClipboardEvent
 * (much faster than keyboard.type, and doesn't rely on the buggy
 * cursor behaviour during setup — the test explicitly re-positions
 * the cursor before each action).
 */

// Total pages used by the 9-page cascade scenarios. We use 3 for most
// tests because the bug reproduces with cascade depth ≥ 2; 3 pages is
// enough to distinguish "cursor stays on page 1" from "cursor jumps to
// a deeper page".
const DOC_PAGES = 3;

test.describe('Canvas editor — cursor cascade fix (#118 follow-up)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('Enter at end of page 1 keeps cursor adjacent (page 1 or 2), never on a deeper page', async ({
    page,
  }) => {
    await createDocumentWithNearFullPages(page, { pages: DOC_PAGES });

    const pageIdsBefore = await page
      .locator('[data-page-id]')
      .evaluateAll((els) =>
        els.map((el) => (el as HTMLElement).getAttribute('data-page-id')!),
      );
    expect(pageIdsBefore.length).toBeGreaterThanOrEqual(DOC_PAGES);
    const page1Id = pageIdsBefore[0];
    const page2Id = pageIdsBefore[1];

    await setCursorAtEndOfPage(page, 0);

    // Press Enter a few times. When the cursor's block overflows to
    // page 2, the cursor follows the text. When the block stays on
    // page 1, the cursor stays too. Either way, NEVER on page 3+.
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press('Enter');
    }
    await waitForCascadeSettled(page);

    const activePageId = await getActivePageId(page);
    expect([page1Id, page2Id]).toContain(activePageId);
  });

  test('Enter in the middle of a paragraph keeps cursor on the same page', async ({
    page,
  }) => {
    await createDocumentWithNearFullPages(page, { pages: DOC_PAGES });

    const pageIdsBefore = await page
      .locator('[data-page-id]')
      .evaluateAll((els) =>
        els.map((el) => (el as HTMLElement).getAttribute('data-page-id')!),
      );
    const page1Id = pageIdsBefore[0];

    // Put the cursor in the MIDDLE of a paragraph in the middle of page 1.
    await setCursorInMiddleOfPage(page, 0);

    // Press Enter — splits the block in the middle. A trailing block
    // from page 1 will cascade to page 2, but the user's cursor (on
    // the start of the new second half) must STAY on page 1.
    await page.keyboard.press('Enter');
    await waitForCascadeSettled(page);

    const activePageId = await getActivePageId(page);
    expect(activePageId).toBe(page1Id);
  });

  // NOTE: "Enter at end of last page → new page created" is covered by
  // the manual smoke test in specs/035-fix-118-cursor-cascade/quickstart.md.
  // Automating it is fragile because the cascade destination is a
  // brand-new page whose editor mounts asynchronously (flow editor,
  // not an `-ftb` text box), and Playwright's focus tracking through
  // that transition is flaky. The core invariants — cursor stays at
  // user's edit position, cursor never jumps to a deep page, cursor
  // moves within 100 ms — are exercised by the tests above.

  test('cursor reaches final position within 100ms of Enter keydown', async ({
    page,
  }) => {
    await createDocumentWithNearFullPages(page, { pages: DOC_PAGES });
    await setCursorAtEndOfPage(page, 0);

    // Measure purely in-browser to exclude Playwright keyboard-press
    // IPC overhead (~30–60ms). We dispatch keyboard events directly
    // on the focused element and wait for two RAFs to let the cascade
    // settle, then read `performance.now()` — all inside a single
    // `evaluate` so the numbers reflect real browser latency.
    const elapsed = await page.evaluate(
      () =>
        new Promise<number>((resolve) => {
          const active = document.activeElement as HTMLElement | null;
          if (!active) {
            resolve(-1);
            return;
          }
          const t0 = performance.now();
          const key = { key: 'Enter', bubbles: true, cancelable: true };
          active.dispatchEvent(new KeyboardEvent('keydown', key));
          active.dispatchEvent(new KeyboardEvent('keypress', key));
          active.dispatchEvent(new KeyboardEvent('keyup', key));
          // Wait for 2 RAFs so the cascade has fully settled.
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
              resolve(performance.now() - t0);
            }),
          );
        }),
    );
    // NFR-002: real-world perceived latency should be under 100ms.
    // Because our dispatch path skips Playwright IPC and measures in
    // the same JS context, this asserts the true end-to-end budget.
    expect(elapsed).toBeLessThan(100);
    expect(elapsed).toBeGreaterThan(0);
  });

  test.describe('RTL (Hebrew) document — same rules apply (FR-007)', () => {
    test('Enter at end of page 1 keeps cursor on page 1 or 2, never deeper', async ({
      page,
    }) => {
      await createDocumentWithNearFullPages(page, {
        pages: DOC_PAGES,
        language: 'he',
      });

      const pageIdsBefore = await page
        .locator('[data-page-id]')
        .evaluateAll((els) =>
          els.map((el) => (el as HTMLElement).getAttribute('data-page-id')!),
        );
      const page1Id = pageIdsBefore[0];
      const page2Id = pageIdsBefore[1];

      await setCursorAtEndOfPage(page, 0);
      for (let i = 0; i < 3; i++) {
        await page.keyboard.press('Enter');
      }
      await waitForCascadeSettled(page);

      expect([page1Id, page2Id]).toContain(await getActivePageId(page));
    });

    test('Enter in the middle of a paragraph keeps cursor on the same page', async ({
      page,
    }) => {
      await createDocumentWithNearFullPages(page, {
        pages: DOC_PAGES,
        language: 'he',
      });

      const pageIdsBefore = await page
        .locator('[data-page-id]')
        .evaluateAll((els) =>
          els.map((el) => (el as HTMLElement).getAttribute('data-page-id')!),
        );
      const page1Id = pageIdsBefore[0];

      await setCursorInMiddleOfPage(page, 0);
      await page.keyboard.press('Enter');
      await waitForCascadeSettled(page);

      expect(await getActivePageId(page)).toBe(page1Id);
    });
  });

  test.describe('Enter on pasted 5-page document', () => {
    test('Enter at beginning of last line pushes text to next page, viewport stays near', async ({
      page,
    }) => {
      await createDocumentWithNearFullPages(page, { pages: 5 });
      await waitForCascadeSettled(page);

      const pageIdsBefore = await page
        .locator('[data-page-id]')
        .evaluateAll((els) =>
          els.map((el) => (el as HTMLElement).getAttribute('data-page-id')!),
        );
      const page1Id = pageIdsBefore[0];
      const page2Id = pageIdsBefore[1];

      // Get the text of the last block on page 1.
      const lastLineText = await page.evaluate(() => {
        const p1 = document.querySelector('[data-page-id]');
        const pm = p1?.querySelector('.ProseMirror');
        if (!pm || pm.children.length === 0) return null;
        return pm.children[pm.children.length - 1].textContent;
      });
      expect(lastLineText).toBeTruthy();

      // Place cursor at the BEGINNING of the last block on page 1.
      await page.evaluate(() => {
        const p1 = document.querySelector('[data-page-id]');
        const pm = p1?.querySelector('.ProseMirror');
        if (!pm) throw new Error('no ProseMirror');
        const lastBlock = pm.children[pm.children.length - 1];
        const textNode = lastBlock.firstChild;
        if (!textNode) throw new Error('no text');
        const range = document.createRange();
        range.setStart(textNode, 0);
        range.collapse(true);
        window.getSelection()?.removeAllRanges();
        window.getSelection()?.addRange(range);
        (pm as HTMLElement).focus();
      });

      // Press Enter — creates empty line above, pushes last line down.
      await page.keyboard.press('Enter');
      await waitForCascadeSettled(page);

      // Cursor should be on page 1 or 2 (adjacent), NEVER deeper.
      const afterEnter = await getActivePageId(page);
      expect([page1Id, page2Id]).toContain(afterEnter);

      // The pushed text should now be on page 2.
      const page2HasText = await page.evaluate((text) => {
        const pages = document.querySelectorAll('[data-page-id]');
        if (pages.length < 2) return false;
        const pm2 = pages[1].querySelector('.ProseMirror');
        if (!pm2) return false;
        for (const child of pm2.children) {
          if (child.textContent === text) return true;
        }
        return false;
      }, lastLineText);
      expect(page2HasText).toBe(true);

      // Viewport must NOT jump to a deep page (the original bug).
      const scroll = await page.evaluate(() => {
        const c = document.querySelector('[data-scroll-container]');
        return Math.round(c?.scrollTop || 0);
      });
      expect(scroll).toBeLessThan(3000);
    });
  });

  test.describe('Cross-page Backspace merge', () => {
    test('Backspace at start of page 2 merges first line with page 1', async ({
      page,
    }) => {
      await createDocumentWithNearFullPages(page, { pages: 3 });
      await waitForCascadeSettled(page);

      const pageIdsBefore = await page
        .locator('[data-page-id]')
        .evaluateAll((els) =>
          els.map((el) => (el as HTMLElement).getAttribute('data-page-id')!),
        );
      const page1Id = pageIdsBefore[0];

      // Get the first line text of page 2 before merge.
      const firstLineOfPage2 = await page.evaluate(() => {
        const pages = document.querySelectorAll('[data-page-id]');
        if (pages.length < 2) return null;
        const pm2 = pages[1].querySelector('.ProseMirror');
        if (!pm2 || pm2.children.length === 0) return null;
        return pm2.children[0].textContent;
      });
      expect(firstLineOfPage2).toBeTruthy();

      // Place cursor at the very start of page 2's first block.
      await page.evaluate(() => {
        const pages = document.querySelectorAll('[data-page-id]');
        if (pages.length < 2) throw new Error('need at least 2 pages');
        const pm2 = pages[1].querySelector('.ProseMirror') as HTMLElement;
        if (!pm2) throw new Error('no ProseMirror on page 2');
        const firstBlock = pm2.children[0];
        const textNode = firstBlock.firstChild;
        if (!textNode) throw new Error('no text in first block');
        const range = document.createRange();
        range.setStart(textNode, 0);
        range.collapse(true);
        window.getSelection()?.removeAllRanges();
        window.getSelection()?.addRange(range);
        pm2.focus();
      });

      // Press Backspace — should merge page 2's first line to page 1.
      await page.keyboard.press('Backspace');
      await waitForCascadeSettled(page);

      // Cursor should now be on page 1.
      const activePageId = await getActivePageId(page);
      expect(activePageId).toBe(page1Id);

      // The merged text should now appear on page 1.
      const page1HasMergedText = await page.evaluate((text) => {
        const pages = document.querySelectorAll('[data-page-id]');
        const pm1 = pages[0].querySelector('.ProseMirror');
        if (!pm1) return false;
        // Check if any block contains the merged text (it may be joined
        // with the previous block's text).
        for (const child of pm1.children) {
          if (child.textContent?.includes(text ?? '')) return true;
        }
        return false;
      }, firstLineOfPage2);
      expect(page1HasMergedText).toBe(true);
    });

    test('Backspace at start of page 1 does nothing', async ({ page }) => {
      await createDocumentWithNearFullPages(page, { pages: 2 });
      await waitForCascadeSettled(page);

      const pageIdsBefore = await page
        .locator('[data-page-id]')
        .evaluateAll((els) =>
          els.map((el) => (el as HTMLElement).getAttribute('data-page-id')!),
        );
      const page1Id = pageIdsBefore[0];

      // Get text on page 1 before Backspace.
      const page1TextBefore = await page.evaluate(() => {
        const pm = document
          .querySelector('[data-page-id]')
          ?.querySelector('.ProseMirror');
        return pm?.textContent ?? '';
      });

      // Place cursor at start of page 1's first block.
      await page.evaluate(() => {
        const pm = document
          .querySelector('[data-page-id]')
          ?.querySelector('.ProseMirror') as HTMLElement;
        if (!pm) throw new Error('no ProseMirror');
        const firstBlock = pm.children[0];
        const textNode = firstBlock.firstChild;
        if (!textNode) throw new Error('no text');
        const range = document.createRange();
        range.setStart(textNode, 0);
        range.collapse(true);
        window.getSelection()?.removeAllRanges();
        window.getSelection()?.addRange(range);
        pm.focus();
      });

      // Press Backspace — should do nothing (first page).
      await page.keyboard.press('Backspace');
      await waitForCascadeSettled(page);

      // Cursor stays on page 1.
      expect(await getActivePageId(page)).toBe(page1Id);

      // Text content unchanged.
      const page1TextAfter = await page.evaluate(() => {
        const pm = document
          .querySelector('[data-page-id]')
          ?.querySelector('.ProseMirror');
        return pm?.textContent ?? '';
      });
      expect(page1TextAfter).toBe(page1TextBefore);
    });
  });

  test.describe('Continuous typing across pages', () => {
    test('typing that overflows page boundary moves text and cursor seamlessly', async ({
      page,
    }) => {
      await createDocumentWithNearFullPages(page, { pages: 2 });
      await waitForCascadeSettled(page);

      const pageIdsBefore = await page
        .locator('[data-page-id]')
        .evaluateAll((els) =>
          els.map((el) => (el as HTMLElement).getAttribute('data-page-id')!),
        );
      const page1Id = pageIdsBefore[0];
      const page2Id = pageIdsBefore[1];

      // Place cursor at end of page 1.
      await setCursorAtEndOfPage(page, 0);

      // Type enough text to trigger overflow — press Enter then type.
      await page.keyboard.press('Enter');
      await page.keyboard.type('This line should overflow to the next page');
      await waitForCascadeSettled(page);

      // Cursor should be on page 1 or page 2 (adjacent).
      const activeId = await getActivePageId(page);
      expect([page1Id, page2Id]).toContain(activeId);

      // The typed text should appear somewhere in the document.
      const hasTypedText = await page.evaluate(() => {
        const allPm = document.querySelectorAll('.ProseMirror');
        for (const pm of allPm) {
          if (
            pm.textContent?.includes(
              'This line should overflow to the next page',
            )
          )
            return true;
        }
        return false;
      });
      expect(hasTypedText).toBe(true);
    });
  });
});
