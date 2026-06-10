# Feature 051: Loading Indicators (create / open / upload)

**Date:** 2026-06-07
**Status:** Approved

## Problem

Three user flows have dead time with no visual feedback:

1. **Create document** — `CreateDocumentDialog` shows "Creating…" while the
   `createDocument` server action runs, but closes the dialog and resets the
   button as soon as the action returns, while navigation to the new editor
   page is still in flight. The user stares at the dashboard with no feedback.
2. **Open document** — `DocumentCard` fires a bare `router.push()` on click.
   No prefetch, no pending state: nothing happens visually until the server
   responds and the route-level `loading.tsx` takes over.
3. **Upload material** — `PersonalFileUpload` shows a fake progress bar
   (supabase-js standard upload has no progress callback; the bar sits at 0%
   and jumps to 100), and the indicator disappears as soon as the storage
   upload finishes — while `createPersonalFile()` (text extraction, chunking,
   embedding: 10–30 s for large PDFs) is still running. The longest phase is
   completely silent, ending in a surprise "File imported" toast.

The root pattern in (1) and (3): the client tracked only part of a multi-step
async flow with a single boolean, instead of modeling the full flow.

## Design

### 1. Create document — `src/components/dashboard/create-document-dialog.tsx`

- On success, wrap `router.push()` in `useTransition`'s `startTransition`.
- Do **not** close the dialog or reset `isSubmitting` on success; the dialog
  stays open with the disabled "Creating…" button until the destination route
  renders and the dialog unmounts with the navigation.
- On error, reset `isSubmitting` and show the error (existing behavior).

### 2. Open document — `src/components/dashboard/document-card.tsx`

- Wrap the card click's `router.push()` in `useTransition`.
- While `isPending`, show a `Loader2` spinner on the card (same idiom the card
  already uses for PDF export) and ignore further clicks.

### 3. Upload material — `src/components/dashboard/personal-file-upload.tsx`, `src/hooks/use-file-upload.ts`

- Replace the fake percent bar with an honest two-phase indicator spanning the
  whole operation:
  - `uploading` — storage upload in progress: spinner + "Uploading…"
  - `processing` — `createPersonalFile()` (extraction + embedding) in
    progress: spinner + "Processing file…"
- Phase state lives in `PersonalFileUpload` (`idle → uploading → processing →
idle`); `useFileUpload` keeps validation/upload but drops the dead
  `progress` number.
- The upload button remains replaced by the indicator until the flow finishes;
  errors at either phase show the existing toast and restore the button.

## Out of scope

- Granular byte-level upload progress (requires TUS resumable uploads — not
  worth it at the 50 MB cap).
- PDF viewer/editor changes; math subscript paste handling (dropped).

## Testing

- Unit (Vitest + RTL): dialog stays open and disabled after successful create;
  card fires navigation once and shows spinner while pending; upload component
  walks idle → uploading → processing → idle and shows phase labels; errors
  restore the button.
- E2E (Playwright, real flows): create-document flow lands in the editor with
  the creating indicator shown during the transition; opening a document from
  a card shows the pending spinner; uploading a fixture PDF shows
  "Processing file…" before the file appears in the list.
- `e2e/TEST_REGISTRY.md` updated accordingly.
