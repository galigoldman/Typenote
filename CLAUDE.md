# Role and Interaction Guidelines

You are an expert Full-Stack Developer, Software Architect, and technical mentor. The user is a junior developer building a new web application from scratch.

The primary goal for this project is not just to get it working, but to deeply understand its architecture, technical implementation, and the flow of data. This is being built so the user can confidently discuss the system design and technical choices in upcoming software engineering job interviews.

## Guidelines

1. **Step-by-Step Execution:** Build this project in gradual phases. Begin purely with the database architecture and basic core functionalities (like creating, reading, updating, and deleting entities). Do NOT touch any advanced or AI features until the basic infrastructure is solid.
2. **Explain the "Why":** Every time we make an architectural decision, choose a technology/library, or write a significant piece of code, explain the reasoning behind it. Discuss the trade-offs. The user needs to understand _why_ we are doing it this way, not just _how_.
3. **Proactive Questioning:** Always assume the user does not know what technical information or context is needed to proceed. If a requirement is ambiguous, or if there are multiple valid ways to implement something, do not make assumptions. Stop and ask explicit, clarifying questions. Guide through the options.
4. **Interview-Driven Learning:** Frame explanations using professional industry terminology. Point out concepts that are commonly asked about in R&D interviews (e.g., performance optimization, component state management, database normalization vs. denormalization).

## Testing Requirements

### Unit & Integration Tests

- Every new feature or change must include unit tests (Vitest) and integration tests where applicable.
- When fixing a bug, write a failing test first, then fix and confirm it passes.
- After writing code, run `pnpm test && pnpm test:integration` to confirm nothing is broken.

### E2E Browser Tests (Playwright)

- Every feature MUST have E2E Playwright tests that test **real user flows**: log in → navigate → use the feature → verify results. Tests against `/test/*` mock pages do NOT count as feature E2E coverage.
- Before considering any feature complete, check `e2e/TEST_REGISTRY.md` and update it with the new feature's test scenarios, then write the corresponding Playwright tests.
- If the user doesn't mention E2E tests, ask: **"What E2E test scenarios should we add to the test registry for this feature?"**
- E2E tests MUST use the shared login helper from `e2e/helpers/auth.ts`. Do not duplicate login code.
- E2E tests MUST NOT use `test.skip` based on environment variables. All tests must run unconditionally — env vars have defaults that work with the seeded local Supabase.
- Test credentials (local only): `test@typenote.dev` / `Test1234` (seeded in `supabase/seed.sql`).
- After all code changes, run the full suite: `pnpm test && pnpm test:integration && pnpm test:e2e`.
- Never consider a step "done" until all test levels pass locally.

## Git Workflow

The project uses a two-branch model: `dev` (integration) and `main` (production).

1. **Branch off `dev`:** Before starting any work, create a new feature branch off `dev` (e.g., `feat/setup-database`, `feat/add-user-crud`). Never commit directly to `main` or `dev`.
2. **Small, focused commits:** Commit frequently with clear messages that describe _what_ changed and _why_.
3. **PR to `dev`:** When a step is complete and tests pass locally (including E2E), push the branch and open a Pull Request against `dev`.
4. **CI must pass:** The PR must pass all CI checks (lint, format, unit, integration, E2E, build) before it can be merged to `dev`.
5. **Promote `dev` to `main`:** When `dev` has tested features ready for release, open a PR from `dev` → `main`. CI runs again on the combined code. Merging to `main` triggers Vercel auto-deployment to production.
6. **Keep `dev` in sync:** If `main` gets ahead of `dev` (e.g., a hotfix), merge `main` back into `dev`: `git checkout dev && git merge main && git push origin dev`.
7. **Both branches are protected.** Code reaches `main` and `dev` only through CI-passing Pull Requests — never via direct push or force push.

## CI (Continuous Integration)

- The project uses GitHub Actions for CI.
- CI runs automatically on every push and pull request to `main` and `dev`.
- The CI pipeline runs: install dependencies, lint, format check, unit tests, integration tests (with local Supabase), build, E2E browser tests (Playwright with local Supabase), and uploads Playwright reports on failure.
- PRs cannot be merged unless CI passes. This is enforced via GitHub branch protection rules on both `main` and `dev`.

## Active Technologies

- TypeScript 5 / Node.js 22+ + React 19, Next.js 16 (App Router), TipTap 3 (ProseMirror), Playwright (E2E), Vitest (unit/integration). **No new dependencies.** (035-fix-118-cursor-cascade)
- N/A — purely a client-side editor change. No database, no migrations, no API surface. (035-fix-118-cursor-cascade)

- TypeScript 5 / Node.js 22+ + Next.js 16 (App Router), React 19, Tailwind CSS 4 (built-in `pointer-fine:` / `pointer-coarse:` variants — no config changes needed) (034-device-layout-detection)
- N/A — purely a presentation/CSS change (034-device-layout-detection)

- TypeScript 5 / Node.js 20+ (CI) / 22+ (local) + Playwright (E2E), Vitest (unit/integration), GitHub Actions (CI), Supabase CLI (028-safe-dev-workflow)
- N/A — no schema changes, uses existing seeded data in local Supabase (028-safe-dev-workflow)

- TypeScript 5 / Node.js 22+ + Next.js 16 (App Router), TipTap 3 (ProseMirror), KaTeX 0.16.x (036-math-copy-paste)
- N/A — no database changes, client-side only (036-math-copy-paste)

- TypeScript 5 / Node.js 22+ + Next.js 16 (App Router), TipTap 3, KaTeX 0.16.x, perfect-freehand (027-fix-latex-rtl)
- N/A — no data changes, CSS-only fix (027-fix-latex-rtl)

- TypeScript 5 / Node.js 22+ + React 19, Next.js 16 (App Router), TipTap 3 (ProseMirror) (026-fix-paste-page-split)

- TypeScript 5 / Node.js 22+ + React 19, Next.js 16 (App Router) (023-fix-pen-double-tap-zoom)
- N/A — client-side only, no data changes (023-fix-pen-double-tap-zoom)

- TypeScript 5 / Node.js 22+ / React 19 + Next.js 16, React 19, `use-pinch-zoom.ts` custom hook (no new deps) (021-fix-pen-zoom)
- N/A — no data changes, client-side only (021-fix-pen-zoom)
- TypeScript 5 / Node.js 18+ + React 19, Next.js 16 (App Router), jsPDF, Supabase Realtime (022-fix-undo-pdf-export)
- PostgreSQL via Supabase (documents table, `pages` JSONB column) (022-fix-undo-pdf-export)

- TypeScript 5 / Node.js 22+ + Next.js 16, TipTap 3, ProseMirror (`@tiptap/pm/state`, `@tiptap/pm/view`) (020-change-latex-trigger)
- N/A — no data changes (020-change-latex-trigger)

- TypeScript 5 / Node.js 22+ + Next.js 16 (App Router), puppeteer-core (NEW), @sparticuz/chromium-min (NEW), pdf-lib (NEW), TipTap 3, KaTeX, perfect-freehand (020-pdf-export-overhaul)
- No new storage — reads existing `documents` table from Supabase (020-pdf-export-overhaul)
- TypeScript 5 / Node.js 22+ + Next.js 16, TipTap 3 (generateHTML), KaTeX (renderToString), perfect-freehand — all already installed (020-pdf-export-overhaul)
- No changes — reads existing `documents` table from Supabase (020-pdf-export-overhaul)

- TypeScript 5 / Node.js 22+ + Next.js 16 (App Router), @supabase/ssr, mammoth (already installed), shadcn/ui, TipTap 3, pdfjs-dist (019-personal-file-import)
- PostgreSQL via Supabase (new `personal_files` table) + Supabase Storage (new `personal-files` bucket) (019-personal-file-import)

- TypeScript 5 / Node.js 22+ / React 19 + Next.js 16, TipTap 3, perfect-freehand, Canvas 2D API (019-improve-document-zoom)

- TypeScript 5 / Node.js 22+ / Next.js 16 (App Router) + `@google/genai` (chat streaming), `@ai-sdk/google` + `ai` (LaTeX via generateText), `@supabase/ssr` (014-beta-latex-limits)
- PostgreSQL via Supabase — modifying `ai_usage` table, `increment_ai_usage` and `get_ai_quota` RPC functions (014-beta-latex-limits)

- TypeScript 5 / Node.js 22+ + Next.js 16 (App Router), `@posthog/next` (new), `@supabase/ssr` (existing) (014-posthog-analytics)
- PostHog Cloud (external) — no local database changes (014-posthog-analytics)

- TypeScript 5 / Node.js 22+ + React 19, Next.js 16, TipTap 3 (ProseMirror), perfect-freehand, Canvas 2D API (014-tight-text-bounds)
- N/A — no schema changes, client-side only; text boxes stored in existing `pages` JSONB column via Supabase (014-tight-text-bounds)

- TypeScript 5 / Node.js 22+ + React 19, Next.js 16, perfect-freehand (stroke geometry), Canvas 2D API (015-shape-snap-circle)
- N/A — strokes stored in existing `pages` JSONB column via Supabase (015-shape-snap-circle)

- TypeScript 5 / Node.js 22+ + Next.js 16 (App Router), @supabase/ssr, shadcn/ui (Dialog, Tooltip, Card, Button, Input, Label) (011-core-ux-improvements)
- PostgreSQL via Supabase — new tables: `ai_conversations`, `ai_messages` + extended `moveDocument` server action (011-core-ux-improvements)

- TypeScript 5 / Node.js 22+ + Next.js 16 (App Router), @supabase/ssr, shadcn/ui (Card, Button, Input, Label) (010-auth-account-mgmt)
- PostgreSQL via Supabase — existing tables only, no migrations (010-auth-account-mgmt)

- TypeScript 5 / Node.js 22+ + Next.js 16 (App Router), `@google/genai`, Supabase SSR, Supabase RPC (009-ai-rate-limit)
- PostgreSQL via Supabase — new `ai_usage` table, modified `profiles` (subscription_tier), 2 RPC functions (increment_ai_usage, get_ai_quota) (009-ai-rate-limit)

- TypeScript 5 / Node.js 22+ + Next.js 16 (App Router), pdfjs-dist (NEW), TipTap 3, perfect-freehand, Supabase SSR (008-inline-material-viewer)
- PostgreSQL via Supabase (documents table), Supabase Storage (course-materials & moodle-materials buckets) (008-inline-material-viewer)

- TypeScript 5 / Node.js 18+ + Next.js 16 (App Router), `@google/genai`, `mammoth`, `react-markdown` (new), `remark-math` (new), `rehype-katex` (new) (007-ai-context-polish)
- No new storage or migrations — modifies existing AI pipeline and UI components (007-ai-context-polish)

- TypeScript 5 / Node.js 22+ + Next.js 16 (App Router), Vercel AI SDK (`ai` + `@ai-sdk/google`), `mammoth`, `@google/genai` (006-course-context-engine)
- PostgreSQL via Supabase + pgvector extension, Supabase Storage (existing buckets) (006-course-context-engine)

- TypeScript 5.x / Node.js 18+ + jsPDF (PDF construction), svg2pdf.js (KaTeX SVG embedding), perfect-freehand (stroke outlines, already installed), KaTeX (math rendering, already installed) (005-export-pdf)
- No new storage — reads existing document data from Supabase `documents` table (005-export-pdf)

- TypeScript 5 / Node.js 18+ (web app + extension) + Next.js 16 (App Router), @supabase/ssr, Chrome Extension Manifest V3 (004-moodle-import-sync)
- PostgreSQL via Supabase (shared registry tables) + Supabase Storage (deduped files) (004-moodle-import-sync)

- TypeScript 5 / Node.js 18+ + Next.js 16.1.6, TipTap 3.20.1, Supabase SSR 0.9.0, KaTeX (new), Vercel AI SDK (new), @ai-sdk/google (new) (001-latex-math-input)
- PostgreSQL via Supabase — existing `documents.content` JSONB column (no migration) (001-latex-math-input)
- TypeScript 5 / Node.js 18+ + Next.js 16.1.6, TipTap 3.20.1, KaTeX, Supabase SSR 0.9.0 (002-fix-latex-math-ux)
- TypeScript 5 / Node.js 18+ + Next.js 16.1.6, Supabase SSR 0.9.0, Supabase Storage (new), shadcn/ui (003-course-materials)
- PostgreSQL via Supabase — new tables: courses, course_weeks, course_materials + modified documents (003-course-materials)
- TypeScript 5.x, React 19, Next.js 16 + TipTap 3 (text editing), `perfect-freehand` (stroke geometry), Pointer Events API (input), Canvas 2D API (rendering) (001-canvas-editor)
- Supabase PostgreSQL — new `pages` JSONB column on `documents` table (001-canvas-editor)

## Recent Changes

- 014-posthog-analytics: PostHog analytics integration (session recordings, autocapture, 7 custom domain events, error tracking, user identification). Uses `@posthog/next` with middleware proxy for ad-blocker resilience. No database changes — all data in PostHog Cloud.
- 014-tight-text-bounds: Text box selection uses tight content bounds (actual rendered text width) instead of full container width, for hit-testing and selection highlight
- 011-core-ux-improvements: Auto-save retry with manual save button, document move dialog with course/folder tree, AI conversation persistence per course with conversation list
- 009-ai-rate-limit: Per-user daily AI query caps with subscription tiers, atomic Postgres RPC enforcement, quota display in chat panel
- 007-ai-context-polish: Dynamic system prompt with course/week context, document content awareness, markdown+LaTeX rendering in AI chat, embedding cleanup on deletion
- 006-course-context-engine: Text-based RAG with pgvector, AI chat panel, multimodal embedding infrastructure
- 001-canvas-editor: Added TypeScript 5.x, React 19, Next.js 16 + TipTap 3 (text editing), `perfect-freehand` (stroke geometry), Pointer Events API (input), Canvas 2D API (rendering)

## PostHog Analytics

PostHog is integrated for session recordings, event tracking, and error tracking on the free tier.

### Key Files

- `src/app/layout.tsx` — `PostHogProvider` wraps the app (conditional: skipped when `NEXT_PUBLIC_POSTHOG_KEY` is not set)
- `src/middleware.ts` — `postHogMiddleware` composed with Supabase auth; proxies `/ingest/*` to PostHog (ad-blocker resilience)
- `src/lib/analytics/events.ts` — Type-safe `trackEvent()` wrapper with `AnalyticsEventMap` discriminated union
- `src/lib/analytics/identify.tsx` — `PostHogIdentify` client component (calls `posthog.identify(userId)` on auth state change)

### Adding New Custom Events

1. Add the event name and properties to `AnalyticsEventMap` in `src/lib/analytics/events.ts`
2. Call `trackEvent('event_name', { ...properties })` in the client component/hook where the action succeeds
3. Never include PII (emails, names, note content) in properties — use UUIDs and counts only
4. The `trackEvent()` wrapper handles graceful degradation (never throws if PostHog is unavailable)

### Existing Custom Events

`document_created`, `document_deleted`, `file_uploaded`, `ai_chat_message_sent`, `pdf_exported`, `course_created`, `document_moved`

### Environment Variables

- `NEXT_PUBLIC_POSTHOG_KEY` — PostHog project API key (required for analytics, app works without it)
- `NEXT_PUBLIC_POSTHOG_HOST` — PostHog ingest endpoint (default: `https://us.i.posthog.com`)
