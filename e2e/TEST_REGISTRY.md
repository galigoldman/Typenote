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
- [ ] Rename document from dashboard — ⚠️ NOT WIRED UP (onRename prop not passed to DocumentCard)
- [x] Delete document with confirmation dialog
- [x] Document appears in correct folder
- [x] Move document to different folder/course

---

## Canvas Editor (`e2e/canvas-editor.spec.ts`) — NOT YET IMPLEMENTED

- [ ] Draw stroke with pen tool (pointer events with pointerType: pen)
- [ ] Draw stroke with finger/mouse (pointer events with pointerType: mouse)
- [ ] Erase stroke with eraser tool
- [ ] Add text box and type in it
- [ ] Select and move text box
- [ ] Undo drawing action
- [ ] Redo drawing action
- [ ] Zoom in/out
- [ ] Pan canvas
- [ ] Switch between pages
- [ ] Add new page

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
- [ ] Math renders in RTL text context — deferred to later batch

---

## Courses (`e2e/courses.spec.ts`) — IMPLEMENTED

- [x] Create new course
- [x] View course with weeks
- [x] Create document inside course
- [x] Add file inside course (import file)
- [ ] Move document between courses — covered by documents.spec.ts move test
- [ ] View course material inline — deferred (depends on file conversion)

---

## File Upload (`e2e/file-upload.spec.ts`) — IMPLEMENTED

- [x] Import file into course (PDF upload)
- [x] Open imported file (creates document)
- [x] Delete imported file

---

## AI Chat (`e2e/ai-chat.spec.ts`) — NOT YET IMPLEMENTED

- [ ] Open AI chat panel
- [ ] Send a message and receive response
- [ ] Chat shows quota usage
- [ ] Chat renders markdown and LaTeX in responses
- [ ] Start new conversation
- [ ] Switch between conversations

---

## PDF Export (`e2e/pdf-export.spec.ts`) — PARTIALLY IMPLEMENTED

- [x] Export as PDF button visible in editor toolbar (`e2e/export-pdf-editor.spec.ts`)
- [x] Clicking export triggers PDF download (`e2e/export-pdf-editor.spec.ts`) — ⚠️ SKIPPED IN CI (needs puppeteer Chromium)
- [x] Export as PDF option in dashboard context menu (`e2e/export-pdf-dashboard.spec.ts`)
- [x] Dashboard export triggers PDF download (`e2e/export-pdf-dashboard.spec.ts`) — ⚠️ SKIPPED IN CI (needs puppeteer Chromium)
- [ ] Exported PDF contains text content
- [ ] Exported PDF contains drawings/strokes
- [ ] Multi-page document exports all pages

---

## Real-time Sync (`e2e/realtime-sync.spec.ts`) — IMPLEMENTED (local only)

- [x] Typing in Tab A appears in Tab B — ⚠️ SKIPPED IN CI (Supabase Realtime too slow locally)
- [x] Lock indicator shows when another tab is editing — ⚠️ SKIPPED IN CI
- [x] "Take over editing" transfers edit lock — ⚠️ SKIPPED IN CI

---

## Summary

| Feature             | Status          | Spec File                    | Tests     |
| ------------------- | --------------- | ---------------------------- | --------- |
| Auth                | Implemented     | `e2e/auth.spec.ts`           | 7/7       |
| Documents           | Implemented     | `e2e/documents.spec.ts`      | 5/6       |
| Canvas Editor       | Not implemented | `e2e/canvas-editor.spec.ts`  | 0/11      |
| Text Editor Toolbar | Implemented     | `e2e/editor-toolbar.spec.ts` | 12/12     |
| LaTeX Math          | Implemented     | `e2e/latex-math.spec.ts`     | 4/5       |
| Courses             | Implemented     | `e2e/courses.spec.ts`        | 4/6       |
| File Upload         | Implemented     | `e2e/file-upload.spec.ts`    | 3/4       |
| AI Chat             | Not implemented | `e2e/ai-chat.spec.ts`        | 0/6       |
| PDF Export          | Partial         | `e2e/export-pdf-*.spec.ts`   | 4/7       |
| Real-time Sync      | Implemented     | `e2e/realtime-sync.spec.ts`  | 3/3       |
| **Total**           |                 |                              | **42/67** |
