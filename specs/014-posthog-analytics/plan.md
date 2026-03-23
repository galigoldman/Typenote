# Implementation Plan: PostHog Analytics Integration

**Branch**: `014-posthog-analytics` | **Date**: 2026-03-23 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/014-posthog-analytics/spec.md`

## Summary

Integrate PostHog analytics into Typenote using the `@posthog/next` package to enable session recordings, autocapture events, 7 custom domain events, error tracking, and user identification — all on PostHog's free tier. The integration is purely client-side with a middleware proxy for ad-blocker resilience. No database changes required.

## Technical Context

**Language/Version**: TypeScript 5 / Node.js 22+
**Primary Dependencies**: Next.js 16 (App Router), `@posthog/next` (new), `@supabase/ssr` (existing)
**Storage**: PostHog Cloud (external) — no local database changes
**Testing**: Vitest (unit tests for provider, events wrapper, identify component)
**Target Platform**: Web browser (all modern browsers)
**Project Type**: Web application (Next.js)
**Performance Goals**: <200ms increase in Time to Interactive (SC-004)
**Constraints**: Free tier limits (1M events/month, 5K recordings/month), non-blocking (FR-010)
**Scale/Scope**: Single package install, ~6 files created/modified, 7 custom events

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                       | Status | Notes                                                                                                                              |
| ------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| I. Incremental Development      | PASS   | No database changes; additive client-side integration. Foundational infrastructure (auth, DB) already solid.                       |
| II. Test-Driven Quality         | PASS   | Unit tests planned for provider, event wrapper, identify component, and graceful degradation.                                      |
| III. Protected Main Branch      | PASS   | Working on feature branch `014-posthog-analytics`. Will open PR when complete.                                                     |
| IV. Migrations as Code          | N/A    | No database changes — PostHog stores all analytics data externally.                                                                |
| V. Interview-Ready Architecture | PASS   | Observer pattern, analytics separation of concerns, graceful degradation, and privacy-by-design are all interview-relevant topics. |

**Post-Phase 1 Re-check**: All gates still pass. No design decisions introduced database changes or skipped testing.

## Project Structure

### Documentation (this feature)

```text
specs/014-posthog-analytics/
├── plan.md              # This file
├── research.md          # Phase 0 output — SDK research, architecture decisions
├── data-model.md        # Phase 1 output — conceptual entities (no DB tables)
├── quickstart.md        # Phase 1 output — setup & verification guide
├── contracts/
│   └── custom-events.md # Phase 1 output — typed event definitions
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code (repository root)

```text
src/
├── app/
│   └── layout.tsx                    # MODIFY — wrap with PostHogProvider + PostHogPageView
├── middleware.ts                     # MODIFY — compose with postHogMiddleware
├── lib/
│   └── analytics/
│       ├── events.ts                 # CREATE — typed custom event definitions + trackEvent()
│       └── identify.tsx              # CREATE — PostHogIdentify client component
├── components/
│   ├── ai/
│   │   └── ai-chat-panel.tsx         # MODIFY — add trackEvent('ai_chat_message_sent')
│   └── dashboard/
│       ├── document-card.tsx          # MODIFY — add trackEvent('document_deleted')
│       └── (create dialogs)          # MODIFY — add trackEvent('document_created', 'course_created')
├── hooks/
│   ├── use-export-pdf.ts             # MODIFY — add trackEvent('pdf_exported')
│   └── use-file-upload.ts            # MODIFY — add trackEvent('file_uploaded')

tests/
├── src/lib/analytics/
│   ├── events.test.ts                # CREATE — trackEvent unit tests
│   └── identify.test.tsx             # CREATE — PostHogIdentify component tests
```

**Structure Decision**: No new directories except `src/lib/analytics/` — a single module containing the event tracker and user identification component. All other changes are modifications to existing files. This keeps the analytics footprint minimal and centralized.

## Complexity Tracking

No constitution violations — no complexity justification needed.

## Architecture Decisions

### Why client-side tracking over server-side?

All 7 custom events originate from user interactions in the browser. Tracking client-side:

1. Automatically links events to session recordings (same `session_id`)
2. Keeps server actions focused on business logic (separation of concerns)
3. Avoids importing PostHog into every server action file
4. The client already knows when a server action succeeds (Promise resolution)

**Interview talking point**: This is the **Observer Pattern** — the analytics layer observes application events without coupling to business logic. The `trackEvent()` wrapper acts as a mediator.

### Why a centralized `trackEvent()` wrapper?

Instead of calling `posthog.capture()` directly throughout the codebase:

1. **Type safety**: TypeScript discriminated union prevents invalid event/property combinations
2. **Single responsibility**: One place to add logging, sampling, or feature flags for analytics
3. **Testability**: Mock one function, not PostHog internals
4. **Graceful degradation**: Wrapper handles PostHog-unavailable scenarios silently

### Why proxy through middleware?

Ad blockers block requests to `*.posthog.com`. The middleware proxy rewrites `/ingest/*` → PostHog servers, making tracking requests appear as first-party. This increases data capture rate by 10-30% in practice.

## Implementation Phases

### Phase 1: PostHog SDK Setup (P1 — Session Recordings + Pageviews)

1. Install `@posthog/next`
2. Add env vars to `.env.local.example`
3. Compose `postHogMiddleware` into existing `src/middleware.ts`
4. Add `PostHogProvider` + `PostHogPageView` to `src/app/layout.tsx`
5. Create `src/lib/analytics/identify.tsx` — user identification on auth state
6. Write unit tests for provider rendering and identify component
7. Manual verification: pageviews + session recordings visible in PostHog

### Phase 2: Custom Event Tracking (P1 — Domain Events)

1. Create `src/lib/analytics/events.ts` with typed event definitions
2. Write unit tests for `trackEvent()` (correct capture calls, graceful degradation)
3. Add `trackEvent()` calls to 7 locations:
   - Document create/delete dialogs
   - Course create dialog
   - Document move dialog
   - `use-file-upload.ts`
   - `use-export-pdf.ts`
   - `ai-chat-panel.tsx`
4. Manual verification: all 7 events appear in PostHog with correct properties

### Phase 3: Error Tracking + Polish (P2)

1. Enable `capture_exceptions: true` in PostHog client options
2. Verify errors appear in PostHog dashboard with linked session recordings
3. Run full test suite to confirm no regressions
4. Update `.env.local.example` documentation
