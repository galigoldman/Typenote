# E2E Test Registry

This file lists every application feature and the browser tests that must exist for it.
When adding or modifying a feature, update this registry and write the corresponding tests.

**Rules:**

- Every feature section lists a target spec file and its implementation status
- `[x]` = test exists and passes, `[ ]` = test not yet written
- When you add a new feature, add a section here BEFORE considering the feature complete

---

## Auth (`e2e/auth.spec.ts`) — IMPLEMENTED

- [x] Sign up with email and password
- [x] Sign up with invalid email shows error
- [x] Log in with valid credentials redirects to dashboard
- [x] Log in with wrong password shows error
- [x] Log out returns to login page
- [x] Password reset sends email (forgot password flow)
- [x] Unauthenticated user is redirected to login

---

## Documents (`e2e/documents.spec.ts`) — IMPLEMENTED

- [x] Create new document from dashboard
- [x] Open existing document navigates to editor
- [x] Rename document from editor title input (auto-saves on blur)
- [x] Delete document with confirmation dialog
- [x] Document appears in correct folder
- [x] Move document to different folder/course

---

## Canvas Editor (`e2e/canvas-editor.spec.ts`) — IMPLEMENTED (local only)

- [x] Draw continuous strokes with pen (handwrite letters) — ⚠️ SKIPPED IN CI
- [x] Pen doesn't trigger scroll or selection — ⚠️ SKIPPED IN CI
- [x] Mouse does NOT draw strokes — ⚠️ SKIPPED IN CI
- [x] Circle snap (draw rough circle, hold to snap) — ⚠️ SKIPPED IN CI
- [x] Straight line snap (draw rough line, hold to snap) — ⚠️ SKIPPED IN CI
- [x] Erase stroke — ⚠️ SKIPPED IN CI
- [x] Add text box and type — ⚠️ SKIPPED IN CI
- [x] Select and move text box — ⚠️ SKIPPED IN CI
- [x] Select and move drawing — ⚠️ SKIPPED IN CI
- [x] Undo drawing — ⚠️ SKIPPED IN CI
- [x] Redo drawing — ⚠️ SKIPPED IN CI
- [x] Auto-create page when drawing at bottom — ⚠️ SKIPPED IN CI
- [x] Auto-create page when typing at bottom — ⚠️ SKIPPED IN CI
- [x] Switch between pages — ⚠️ SKIPPED IN CI
- [x] Add new page manually — ⚠️ SKIPPED IN CI
- [x] Type mode — multi-paragraph input overflows to new pages (`e2e/canvas-type-mode-flow.spec.ts`)
- [x] Type mode — long URL wraps at the right edge instead of clipping (`e2e/canvas-type-mode-flow.spec.ts`)

---

## Canvas Editor — Cursor Cascade (`e2e/canvas-editor-cursor-cascade.spec.ts`) — IMPLEMENTED

Follow-up to issue #118. Guards against cursor jumps when a multi-page overflow cascade is triggered by an Enter key. Extended with cross-page Backspace merge and continuous typing tests (037-fix-cross-page-editing).

- [x] Enter at end of last line of page 1 places cursor on page 2 (never on a deeper page)
- [x] Enter at beginning of last line pushes text to next page, viewport stays near
- [x] Enter at end of last line of the last page creates new page and cursor lands on it
- [x] Enter in the middle of a paragraph keeps cursor on the same page
- [x] Cursor reaches its final position within 100ms of the keydown (3, 6, 9 pages)
- [x] RTL (Hebrew) document: same rules apply — cursor is direction-agnostic
- [x] 53-block scenario from commit 381bd6b still passes with zero data loss (regression gate)
- [x] Backspace at start of page 2 merges first line with page 1, cursor at join point
- [x] Backspace at start of page 1 does nothing (no previous page to merge into)
- [x] Continuous typing across page boundary flows text and cursor seamlessly

---

## Text Editor Toolbar (`e2e/editor-toolbar.spec.ts`) — IMPLEMENTED

- [x] Bold/italic/underline/strikethrough formatting
- [x] Heading 1/2/3 from dropdown
- [x] Bullet list, numbered list, task list toggle
- [x] Text alignment (left, center, right)
- [x] Blockquote and code block toggle
- [x] Horizontal rule insertion
- [x] Link insertion and removal
- [x] Undo/redo (toolbar buttons and keyboard shortcuts)
- [x] Toolbar buttons show active state
- [x] Indent/outdent list items
- [x] Focus preservation after toolbar clicks
- [x] Document title editing

---

## LaTeX Math (`e2e/latex-math.spec.ts`) — IMPLEMENTED

- [x] Type LaTeX trigger and enter math expression — ⚠️ SKIPPED IN CI (needs AI API key)
- [x] Rendered math displays correctly
- [x] Edit existing math expression — ⚠️ SKIPPED IN CI (needs AI API key)
- [x] Delete math expression
- [x] Math renders LTR inside RTL text — ⚠️ SKIPPED IN CI (needs AI API key)

---

## Courses (`e2e/courses.spec.ts`) — IMPLEMENTED

- [x] Create new course
- [x] View course with weeks
- [x] Create document inside course
- [x] Add file inside course (import file)
- [ ] Move document between courses — covered by documents.spec.ts move test
- [x] View course material opens in canvas editor — ⚠️ SKIPPED IN CI

---

## File Upload (`e2e/file-upload.spec.ts`) — IMPLEMENTED

- [x] Import file into course (PDF upload)
- [x] Open imported file (creates document)
- [x] Delete imported file

---

## AI Chat (`e2e/ai-chat.spec.ts`) — IMPLEMENTED (local only)

- [x] Open AI chat panel — ⚠️ SKIPPED IN CI (needs course page)
- [x] Send a message and receive response — ⚠️ SKIPPED IN CI (needs AI API key)
- [x] Chat shows quota usage — ⚠️ SKIPPED IN CI
- [x] Chat renders markdown in responses — ⚠️ SKIPPED IN CI (needs AI API key)
- [x] Start new conversation — ⚠️ SKIPPED IN CI
- [x] Switch between conversations — ⚠️ SKIPPED IN CI

---

## PDF Export (`e2e/pdf-export.spec.ts`) — PARTIALLY IMPLEMENTED

- [x] Export as PDF button visible in editor toolbar (`e2e/export-pdf-editor.spec.ts`)
- [x] Clicking export triggers PDF download (`e2e/export-pdf-editor.spec.ts`) — ⚠️ SKIPPED IN CI (needs puppeteer Chromium)
- [x] Export as PDF option in dashboard context menu (`e2e/export-pdf-dashboard.spec.ts`)
- [x] Dashboard export triggers PDF download (`e2e/export-pdf-dashboard.spec.ts`) — ⚠️ SKIPPED IN CI (needs puppeteer Chromium)
- [x] Exported PDF contains text content — ⚠️ SKIPPED IN CI (needs puppeteer Chromium)
- [x] Exported PDF has correct page count — ⚠️ SKIPPED IN CI (needs puppeteer Chromium)
- [ ] Exported PDF contains drawings/strokes — deferred (requires image comparison)

---

## Real-time Sync (`e2e/realtime-sync.spec.ts`) — IMPLEMENTED (local only)

- [x] Typing in Tab A appears in Tab B — ⚠️ SKIPPED IN CI (Supabase Realtime too slow locally)
- [x] Lock indicator shows when another tab is editing — ⚠️ SKIPPED IN CI
- [x] "Take over editing" transfers edit lock — ⚠️ SKIPPED IN CI

---

## Summary

| Feature             | Status      | Spec File                    | Tests     |
| ------------------- | ----------- | ---------------------------- | --------- |
| Auth                | Implemented | `e2e/auth.spec.ts`           | 7/7       |
| Documents           | Implemented | `e2e/documents.spec.ts`      | 6/6       |
| Canvas Editor       | Implemented | `e2e/canvas-editor.spec.ts`  | 15/15     |
| Text Editor Toolbar | Implemented | `e2e/editor-toolbar.spec.ts` | 12/12     |
| LaTeX Math          | Implemented | `e2e/latex-math.spec.ts`     | 5/5       |
| Courses             | Implemented | `e2e/courses.spec.ts`        | 5/6       |
| File Upload         | Implemented | `e2e/file-upload.spec.ts`    | 3/4       |
| AI Chat             | Implemented | `e2e/ai-chat.spec.ts`        | 6/6       |
| PDF Export          | Implemented | `e2e/export-pdf-*.spec.ts`   | 6/7       |
| Real-time Sync      | Implemented | `e2e/realtime-sync.spec.ts`  | 3/3       |
| **Total**           |             |                              | **67/68** |
