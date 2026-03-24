# Quickstart: Fix LaTeX Text Box Cutoff and PDF Import Empty Page

**Date**: 2026-03-24
**Feature**: 024-fix-latex-pdf-bugs

## Prerequisites

- Node.js 22+, pnpm installed
- Supabase CLI installed and `supabase start` running
- `.env.local` configured with local Supabase keys

## Setup

```bash
git checkout 024-fix-latex-pdf-bugs
pnpm install
pnpm dev
```

## Manual Testing

### PDF Import (Bug 1)

1. Log in and navigate to the dashboard
2. Upload a multi-page PDF via the personal files section
3. Click the uploaded PDF to open it as a document
4. Verify each page displays the PDF content as its background
5. Also open a course-material PDF document and verify it still renders (regression check)

### LaTeX Input Box (Bug 2)

1. Open any document in the canvas editor
2. Type `$` to trigger the LaTeX input box (or the configured trigger)
3. Type a long description (40+ characters, up to 500)
4. Verify the full text is visible — no clipping or truncation
5. Move the cursor to the beginning of the text and verify it scrolls correctly

## Automated Tests

```bash
# Run all unit tests
pnpm test

# Run integration tests (requires local Supabase)
pnpm test:integration

# Run specific test files
pnpm test src/lib/editor/math-input-box.test.tsx
pnpm test src/hooks/use-pdf-background.test.ts
```
