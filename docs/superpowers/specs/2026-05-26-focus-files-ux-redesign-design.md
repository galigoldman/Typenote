# Focus Files — UX Redesign

- **Date:** 2026-05-26
- **Status:** Approved (ready for implementation planning)
- **Branch:** `feat/document-context-files` (continues the existing branch)
- **Scope:** UI-only refinement of the document "context files" feature. No DB, server-action, or RAG changes.

## 1. Summary

The "context files" feature works, but two pieces of its UX are unclear (feedback from live testing):

1. **Adding files** uses a cramped inline list that expands inside the panel footer. It should open a proper **dialog**.
2. **The entry widget** — a bare floating 📎 icon labelled "Context files" — doesn't communicate what it does.

This redesign keeps the data model, server actions, and the AI focus-pass exactly as-is. It changes only presentation:

- Rename the feature to **"Focus files"** everywhere in the UI (button, panel title, AI chat cue). The name conveys *"the files the AI focuses on for this note."*
- Move the entry point from a floating icon to a **labeled button in the shared editor toolbar**, next to History.
- Replace the inline picker with a **grouped, multi-select, searchable dialog**.
- Sharpen the panel's purpose copy and empty state.

## 2. Background / current state (verified against disk)

- Components today:
  - `src/components/dashboard/document-context-files.tsx` — wrapper rendering a **floating FAB** (`context-files-toggle`) + count badge, and the panel.
  - `src/components/dashboard/context-files-panel.tsx` — right sidebar list + an **inline footer picker** (`context-files-add` toggles `picking`, candidates render as `context-files-candidate` buttons, "Done" closes).
  - `src/components/dashboard/file-viewer.tsx` — read-only pdf.js viewer (unchanged by this work).
- **Both editors share one toolbar:** `src/components/editor/editor-toolbar.tsx` is imported by the TipTap text editor (`tiptap-editor.tsx`) and the canvas editor (`canvas-editor.tsx`). It has a **History** section (~line 305) containing the version-history toggle.
- **Version-history is the precedent pattern:** open-state lives in each host (`tiptap-editor-with-versions.tsx`, `document-with-ai.tsx`) as `isVersionHistoryOpen`; an `onToggleVersionHistory` callback is passed down through the editor into `EditorToolbar`. We mirror this for Focus files.
- Both hosts already render `DocumentContextFiles` (gated on `courseId`), `AiChatWrapper`, and own `viewerTarget` + `FileViewer`.
- **"Ask AI" is a floating button** rendered by `AiChatWrapper` (E2E uses `getByRole('button', { name: 'Open AI chat' })`) — it is NOT in the toolbar. Focus files goes in the toolbar; the AI cue stays in the chat panel header.
- Server actions in `src/lib/actions/context-files.ts` (`getContextFiles`, `getAttachableFiles`, `attachContextFile`, `detachContextFile`, `getContextFileUrl`) and the `buildAiContext` focus pass are **unchanged**.
- `src/components/ui/dialog.tsx` (shadcn) exists and is used elsewhere — `AddFilesDialog` builds on it.

## 3. Goals / non-goals

**Goals**

- A labeled, discoverable toolbar entry that says what it does, consistent across both editors via the single shared toolbar.
- A clear modal dialog for adding files: grouped by source, multi-select with checkboxes, client-side search, batch attach.
- Purpose copy in the panel + a better empty state, so the feature explains itself.
- Add the error handling the prior review flagged as missing (attach/detach failures must surface, not fail silently).

**Non-goals (this iteration)**

- Any schema, server-action, or RAG change.
- Drag-and-drop attach (mentioned in the original spec, never built; still out of scope).
- Changes to the file viewer behavior.
- Touching the "Ask AI" button placement.

## 4. UX design

### 4.1 Toolbar entry — `EditorToolbar`

- A toggle button `📎 Focus files` with a count badge `(N)` when N > 0, placed adjacent to the History button.
- Rendered **only for course documents** — gated by the presence of an `onToggleFocusFiles` callback (absent for non-course docs, exactly like other optional toolbar affordances).
- Active/pressed styling when the panel is open (`aria-pressed`), matching the toolbar's existing button styling.
- New optional props on `EditorToolbar` (and threaded through `tiptap-editor.tsx` and `canvas-editor.tsx`):
  - `onToggleFocusFiles?: () => void`
  - `focusFilesCount?: number`
  - `isFocusFilesOpen?: boolean`

### 4.2 Panel — rename `ContextFilesPanel` → `FocusFilesPanel`

- Header: 📎 **"Focus files"** + close button (unchanged layout/responsive behavior: static 300px sidebar on `lg`, full-screen on mobile).
- Purpose line under the header: *"The AI focuses on these when answering. Click any file to open it here."*
- Attached list: unchanged (open-in-viewer button = `context-file-item`; remove button `aria-label="Remove <name>"`).
- Empty state: *"No focus files yet — the AI still uses everything in this course. Add the exercise sheet or slides to focus it."*
- Footer **"＋ Add files"** button (`focus-files-add`) now **opens `AddFilesDialog`** (sets local `dialogOpen` state) instead of toggling the inline picker. The inline `picking` UI is removed.
- On dialog close (after a successful batch attach), the panel refreshes its list and reports the new count via `onCountChange`.

### 4.3 `AddFilesDialog` (new component)

- Built on shadcn `Dialog`. Props: `{ open, onOpenChange, courseId, alreadyAttached: {fileType,fileId}[], onConfirm(selected: AttachableFile[]) }`.
- On open: loads candidates via `getAttachableFiles(courseId)` (already returns `{ courseMaterials, personalFiles, moodleFiles }`). Loading + empty states shown.
- Title **"Add focus files"**; subtitle *"Pick imported files for the AI to focus on for this note. You can open them here too."*
- **Search input** filters candidates client-side by name (case-insensitive).
- Candidates grouped under labels **"From Moodle" / "Course materials" / "Personal uploads"**; each row is a checkbox + file icon + name (`focus-files-candidate`). Files already attached render checked + disabled with an "added" hint.
- Footer: **"Cancel"** + primary **"Add N files"** (disabled when N = 0). Confirm calls `onConfirm` with the selected set.
- The panel's `onConfirm` handler attaches each selected file with `attachContextFile` **sequentially** (so a failure can name the specific file), then refreshes. On success the dialog closes; on any failure the dialog stays open and shows an inline error naming the file(s) that failed, leaving the successfully-attached ones in place.

### 4.4 AI chat cue — `ai-chat-panel.tsx`

- Replace "Using N context files" header cue text with **"Focusing on N files"**; still clickable to open the panel (existing wiring unchanged).

### 4.5 Host wiring — `tiptap-editor-with-versions.tsx` + `document-with-ai.tsx`

- Each host owns `isFocusFilesOpen` (bool) and `focusFilesCount` (number).
- The count is loaded once on mount via `getContextFiles(documentId)` (length), independent of the panel's open state, so the toolbar badge is correct before first open. `FocusFilesPanel`'s `onCountChange` keeps it in sync after mutations.
- Toggle + count + open-state passed into the editor (`TiptapEditor` / `CanvasEditor`) → `EditorToolbar`.
- `FocusFilesPanel` rendered as a sibling (gated on `courseId`), receiving `isOpen`, `onClose`, `onCountChange`, `onOpenFile`.
- `FileViewer` rendering unchanged.
- The `DocumentContextFiles` FAB wrapper is **removed**; its responsibilities (panel + count) move into the hosts + `FocusFilesPanel`.

## 5. Components (new / changed / removed)

- **New:** `src/components/dashboard/add-files-dialog.tsx`.
- **Renamed/changed:** `context-files-panel.tsx` → `focus-files-panel.tsx` (`FocusFilesPanel`); inline picker removed, opens dialog, new copy.
- **Changed:** `editor-toolbar.tsx` (+ `tiptap-editor.tsx`, `canvas-editor.tsx` to thread props) — toolbar toggle button.
- **Changed:** `tiptap-editor-with-versions.tsx`, `document-with-ai.tsx` — own focus-files state + count, render panel, pass toggle to toolbar.
- **Changed:** `ai-chat-panel.tsx` — cue text.
- **Removed:** `document-context-files.tsx` (FAB wrapper). The exported `ViewerTarget` type moves to `focus-files-panel.tsx` (or a small shared types spot) so hosts keep importing it.

## 6. Testing plan

**Unit (Vitest)**

- `add-files-dialog.test.tsx`: renders grouped candidates from a mocked `getAttachableFiles`; search filters; already-attached rows checked+disabled; "Add N files" enabled only with a selection and calls `onConfirm` with the chosen set; failed confirm shows an error and keeps the dialog open.
- `editor-toolbar.test.tsx`: Focus files button renders with count badge when `onToggleFocusFiles` provided; hidden when absent; click fires the callback; `aria-pressed` reflects `isFocusFilesOpen`.

**E2E (Playwright) — update `e2e/document-context-files.spec.ts`** (shared `auth.ts`, no `test.skip`, seeded course `30000000-0000-0000-0000-000000000001`)

1. **Attach & detach:** open a course document → click the **toolbar** Focus files button (`focus-files-toggle`) → panel opens → click "Add files" (`focus-files-add`) → **dialog** opens → tick a candidate (`focus-files-candidate`) → "Add 1 file" → item listed (`context-file-item`) → remove it.
2. **Open viewer:** attach a file via the dialog → close dialog → click the attached item → `file-viewer` opens → close.
3. **AI citation → viewer (mocked):** unchanged except any cue-text assertion uses "Focusing on".
4. **Start Homework is gone:** unchanged.

- Update `e2e/TEST_REGISTRY.md` with the new toolbar-button + dialog flow.

**Full suite gate:** `pnpm test && pnpm test:integration && pnpm test:e2e` must pass.

## 7. Risks / open items

- **Test-id churn:** renaming `context-files-toggle`/`context-files-add` to `focus-files-*` requires updating the E2E spec in lockstep; `context-file-item` (attached row) and `file-viewer` are kept to limit churn.
- **Count before first open:** loading the count on mount adds one lightweight `getContextFiles` call per course-document load; acceptable (it returns lightweight rows only).
- **Two hosts duplicate state:** intentional — it mirrors the existing `isVersionHistoryOpen` pattern rather than introducing a new abstraction.
- **Mobile toolbar density:** the canvas header is `pointer-touch:hidden` and merges into the toolbar on touch; the labeled button may need to collapse to icon-only on narrow widths (verify during implementation; acceptable fallback is icon + badge with an `aria-label`).
