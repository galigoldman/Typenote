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

### AI chat — per-user material access (`e2e/ai-chat-per-user-materials.spec.ts`) — PLANNED

- [ ] user sees materials they imported in chat — ⚠️ SKIPPED IN CI (needs AI API key)
- [ ] removing a file from notebook hides it from chat — ⚠️ SKIPPED IN CI (needs AI API key)

---

## PDF Export — IMPLEMENTED

- [x] Export as PDF option in dashboard context menu (`e2e/export-pdf-dashboard.spec.ts`)
- [x] Dashboard export opens print popup with rendered HTML (`e2e/export-pdf-dashboard.spec.ts`) — runs in CI
- [x] Visual regression for 8 fixtures (text, math, RTL math, math-in-structure, invalid LaTeX, long-text, canvas-strokes, canvas-multipage) — see `e2e/pdf-visual-regression.spec.ts`
- [x] Page persistence after export — see `e2e/export-pdf-page-persistence.spec.ts`

PDF export uses native browser print (`window.print()`), not server-side puppeteer. The
visual regression spec is the primary correctness gate; the dashboard spec verifies the
context-menu entry point works end-to-end.

---

## Page Persistence After Export (`e2e/export-pdf-page-persistence.spec.ts`) — IMPLEMENTED

- [x] All 6 pages remain in editor after PDF export and 60-second wait
- Covers: math content detection, auto-save page stripping, Realtime echo guard race condition

---

## Real-time Sync (`e2e/realtime-sync.spec.ts`) — IMPLEMENTED (local only)

- [x] Typing in Tab A appears in Tab B — ⚠️ SKIPPED IN CI (Supabase Realtime too slow locally)
- [x] Lock indicator shows when another tab is editing — ⚠️ SKIPPED IN CI
- [x] "Take over editing" transfers edit lock — ⚠️ SKIPPED IN CI

---

## Drawing Copy/Paste (`e2e/drawing-copy-paste.spec.ts`) — IMPLEMENTED (local only)

- [x] Draw → select → copy → paste cycle is stable — ⚠️ SKIPPED IN CI
- [x] Pasted drawing can be deleted independently — ⚠️ SKIPPED IN CI
- [x] Undo after paste is stable — ⚠️ SKIPPED IN CI
- [x] Shape snap still works in draw mode (no regression) — ⚠️ SKIPPED IN CI
- [x] Copy and paste with no selection does nothing — ⚠️ SKIPPED IN CI
- [x] Select mode toolbar shows Select button — ⚠️ SKIPPED IN CI
- [x] Draw mode toolbar shows Pen and Eraser — ⚠️ SKIPPED IN CI
- [x] Mode switching between Draw and Type is stable — ⚠️ SKIPPED IN CI

---

## Moodle Extension Gating (`e2e/moodle-touch-gating.spec.ts`) — IMPLEMENTED

- [x] Moodle card is hidden on iPad viewport (pointer: coarse)
- [x] Moodle card is visible on desktop viewport (pointer: fine)

---

## Version History (`e2e/version-history.spec.ts`) — PLANNED

- [ ] Open version history sidebar from canvas editor toolbar
- [ ] Version sidebar shows seeded version entries with timestamps
- [ ] Edit document → wait for idle snapshot → version appears in sidebar
- [ ] Restore a version → document content changes and "Before restore" entry appears
- [ ] Empty state shown for document with no versions

---

## Security — XSS (`e2e/security-xss.spec.ts`) — IMPLEMENTED

- [x] XSS payload in document title renders as text on the dashboard and does not execute
- [x] XSS payload in document title renders as text in the editor header and does not execute

---

## Security — Prompt Injection (`e2e/security-prompt-injection.spec.ts`) — IMPLEMENTED

- [x] AI response containing `<script>` / `<img onerror>` / `<svg onload>` renders as text and does NOT execute
- [x] Markdown link with `javascript:` URL in AI response is sanitized — no click execution

---

## Security — File Upload Validation (`e2e/security-file-upload.spec.ts`) — IMPLEMENTED

- [x] Non-PDF file rejected by MIME type — inline error visible, no success toast
- [x] File >50MB rejected — inline error visible, no success toast
- [x] Double-extension file (`report.pdf.exe`) rejected by MIME type, not just extension

---

## Security — API Auth Boundary (`e2e/security-api-auth.spec.ts`) — IMPLEMENTED

- [x] Unauthenticated POST to protected routes (`/api/ai/ask`, `/api/ai/latex`, `/api/ai/search`, `/api/ai/reindex`) returns 401/400/405 (never reaches DB/AI)
- [x] Unauthenticated GET to protected routes (`/api/ai/quota`, `/api/ai/conversations`) returns 401/400/405
- [x] Unauthenticated POST with malformed/empty body returns <500 (no crash path reachable without auth)

---

## Security — Storage RLS (integration test, not E2E)

Test lives in `src/__tests__/integration/storage-rls.integration.test.ts`. Verifies path-prefix RLS on the `personal-files` Storage bucket: list/download/upload/delete attempts on a path NOT owned by the calling user are rejected.

---

## Summary

| Feature               | Status      | Spec File                           | Tests     |
| --------------------- | ----------- | ----------------------------------- | --------- |
| Auth                  | Implemented | `e2e/auth.spec.ts`                  | 7/7       |
| Documents             | Implemented | `e2e/documents.spec.ts`             | 6/6       |
| Canvas Editor         | Implemented | `e2e/canvas-editor.spec.ts`         | 15/15     |
| Text Editor Toolbar   | Implemented | `e2e/editor-toolbar.spec.ts`        | 12/12     |
| LaTeX Math            | Implemented | `e2e/latex-math.spec.ts`            | 5/5       |
| Courses               | Implemented | `e2e/courses.spec.ts`               | 5/6       |
| File Upload           | Implemented | `e2e/file-upload.spec.ts`           | 3/4       |
| AI Chat               | Implemented | `e2e/ai-chat.spec.ts`               | 6/6       |
| AI Chat — Per-user    | Planned     | `e2e/ai-chat-per-user-materials.spec.ts` | 0/2  |
| PDF Export            | Implemented | `e2e/export-pdf-*.spec.ts`          | 6/7       |
| Real-time Sync        | Implemented | `e2e/realtime-sync.spec.ts`         | 3/3       |
| Drawing Copy/Paste    | Implemented | `e2e/drawing-copy-paste.spec.ts`    | 8/8       |
| Moodle Ext Gating     | Implemented | `e2e/moodle-touch-gating.spec.ts`   | 2/2       |
| Extension Real Load   | Implemented | `e2e/extension-real.spec.ts`        | 3/3       |
| Version History       | Planned     | `e2e/version-history.spec.ts`       | 0/5       |
| PDF Visual Regression | Implemented | `e2e/pdf-visual-regression.spec.ts` | 8/8       |
| **Total**             |             |                                     | **88/96** |

---

## PDF Visual Regression (`e2e/pdf-visual-regression.spec.ts`) — IMPLEMENTED

Pixel-comparison tests that catch regressions in the **PDF export pipeline** — the highest-
stakes output in the product. Each test:

1. Seeds a deterministic fixture document via the Supabase admin client (bypasses autosave
   non-determinism — see `e2e/helpers/db.ts`).
2. Logs in, opens the doc, clicks "Export as PDF".
3. The export opens a popup with the print HTML; we neuter `window.print()` so the dialog
   never appears, leaving the rendered HTML to be screenshotted.
4. Compares the full popup screenshot against the committed baseline.

This catches: missing/broken text, font fallback, KaTeX math rendering, RTL/BiDi text flow,
list/heading structure, embedded math in mixed-direction paragraphs.

- [x] Text basics — headings + paragraph + bullet list with bold marks
- [x] Inline math — KaTeX expressions in paragraphs (Pythagoras, fraction, integral)
- [x] RTL + math — Hebrew text with embedded LaTeX (mixed BiDi, regression gate for 027-fix-latex-rtl)
- [x] Math inside headings and list items (layout edge case)
- [x] Invalid LaTeX — error fallback rendering (unbalanced braces, unknown command, empty)
- [x] Long text — wrapping and page-break behaviour (12 paragraphs across A4 boundary)
- [x] Canvas — pen strokes (X pattern in two colours on a lined page)
- [x] Canvas — multi-page document (page 1 horizontal stroke, page 2 vertical stroke)

### Follow-up fixtures to add in later PRs

- [ ] Highlighter strokes (different opacity / blend mode)
- [ ] Stroke that extends to / crosses page boundary
- [ ] Mixed canvas + text content (both pipelines in one doc)
- [ ] Document with text boxes positioned on canvas
- [ ] 50+ page stress test

### Updating baselines

Baselines live in `e2e/pdf-visual-regression.spec.ts-snapshots/` and **must** be regenerated
whenever the export pipeline intentionally changes its output. They are pixel-sensitive to
the host OS, so we standardize on Ubuntu 22.04 (jammy) — the CI runner is pinned to
`ubuntu-22.04` in `.github/workflows/ci.yml`, and Playwright's official Docker image
(`mcr.microsoft.com/playwright:vX-jammy`) matches that.

**On a local Linux machine that already matches (Ubuntu 22.04):**

```bash
pnpm test:e2e:update-snapshots
```

**On macOS / Windows / different Linux:**

```bash
docker run --rm -it \
  -v "$(pwd):/work" \
  -w /work \
  --network host \
  mcr.microsoft.com/playwright:v1.58.2-jammy \
  bash -c "pnpm install --frozen-lockfile && pnpm exec playwright test e2e/pdf-visual-regression.spec.ts --update-snapshots"
```

Both require local Supabase running (`supabase start`), the dev server on
`http://localhost:3000`, and `SUPABASE_SERVICE_ROLE_KEY` available (the helper falls back to
the standard local-Supabase JWT, so CI / local default works without env tweaks).

After regenerating, commit the updated PNGs in the same PR as the intentional change. CI will
fail any PR that drifts from the committed baselines — which is the whole point.
