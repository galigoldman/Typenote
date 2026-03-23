# Tasks: PostHog Analytics Integration

**Input**: Design documents from `/specs/014-posthog-analytics/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/custom-events.md

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Install PostHog SDK, configure environment variables, set up the provider and middleware

- [x] T001 Install `@posthog/next` package via `pnpm add @posthog/next`
- [x] T002 Add `NEXT_PUBLIC_POSTHOG_KEY` and `NEXT_PUBLIC_POSTHOG_HOST` to `.env.local.example`
- [x] T003 Compose `postHogMiddleware` with existing Supabase auth middleware in `src/middleware.ts` — Supabase `updateSession()` runs first, then PostHog middleware with `proxy: true` for ad-blocker resilience
- [x] T004 Add `PostHogProvider` and `PostHogPageView` to root layout in `src/app/layout.tsx` — wrap existing children with PostHogProvider, configure `apiKey` from env, set `clientOptions` with `api_host: '/ingest'` and `capture_exceptions: true` and `session_recording: { maskAllInputs: true }`

**Checkpoint**: PostHog SDK loads on every page. `$pageview` events are autocaptured on route changes. Session recordings begin. App still functions normally.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Create the analytics module and user identification — required before any custom event tracking

**Warning**: No user story work can begin until this phase is complete

- [x] T005 Create typed event definitions and `trackEvent()` wrapper in `src/lib/analytics/events.ts` — define `AnalyticsEvent` discriminated union type per contracts/custom-events.md, implement `trackEvent(event, properties)` that calls `posthog.capture()` with try/catch for graceful degradation when PostHog is unavailable
- [x] T006 Create `PostHogIdentify` client component in `src/lib/analytics/identify.tsx` — use `usePostHog()` hook from `@posthog/next` and Supabase client `onAuthStateChange` listener to call `posthog.identify(user.id)` on sign-in and `posthog.reset()` on sign-out
- [x] T007 Add `PostHogIdentify` component inside `PostHogProvider` in `src/app/layout.tsx`
- [x] T008 Write unit tests for `trackEvent()` in `src/lib/analytics/__tests__/events.test.ts` — test correct `posthog.capture` calls with typed event/properties, test graceful degradation when PostHog is undefined (no throw)
- [x] T009 Write unit tests for `PostHogIdentify` in `src/lib/analytics/__tests__/identify.test.tsx` — test that `posthog.identify` is called with user ID on mount when authenticated, test that `posthog.reset` is called on sign-out
- [x] T010 Run full test suite (`pnpm test`) to verify no regressions from PostHog provider/middleware additions

**Checkpoint**: Analytics module exists with typed events and user identification. All existing tests still pass. Foundation ready for custom event instrumentation.

---

## Phase 3: User Story 1 — Session Recordings Capture User Behavior (Priority: P1) MVP

**Goal**: Session recordings are captured for every user session with privacy masking enabled. Pageviews are tracked automatically on client-side navigation.

**Independent Test**: Visit Typenote, navigate between pages, type in the editor, then check PostHog dashboard — session recording should appear within 5 minutes with full replay fidelity.

**Note**: Session recordings and pageview tracking are already enabled by Phase 1 setup (PostHogProvider + PostHogPageView + session_recording config). This phase validates they work correctly.

- [x] T011 [US1] Verify session recording configuration in `src/app/layout.tsx` — confirm `session_recording: { maskAllInputs: true }` is set in PostHogProvider clientOptions, confirm `PostHogPageView` is rendered inside a `Suspense` boundary
- [x] T012 [US1] Manual verification: start dev server, navigate between pages, interact with UI, then check PostHog dashboard for session recording with mouse movements, clicks, scrolls, and page transitions

**Checkpoint**: Session recordings appear in PostHog dashboard. Pageview events fire on every route change. Input fields are masked in recordings.

---

## Phase 4: User Story 2 — Custom Event Tracking for Key User Actions (Priority: P1)

**Goal**: All 7 custom domain events are captured with correct typed properties when users perform key actions.

**Independent Test**: Perform each of the 7 tracked actions in Typenote, then check PostHog Events tab — all 7 custom events should appear with correct properties.

### Implementation for User Story 2

- [x] T013 [P] [US2] Add `trackEvent('document_created', ...)` in `src/components/dashboard/create-document-dialog.tsx` — after successful `createDocument()` call in `handleSubmit`, capture with `course_id`, `document_type` (canvas_type), and `purpose` properties
- [x] T014 [P] [US2] Add `trackEvent('document_deleted', ...)` in `src/components/dashboard/document-card.tsx` — after successful `deleteDocument()` call in `handleDelete`, capture with `document_id` property
- [x] T015 [P] [US2] Add `trackEvent('course_created', ...)` in `src/components/dashboard/course-dialog.tsx` — after successful `createCourse()` call in `handleSubmit` (only in the create branch, not update), capture with `course_name_length` property
- [x] T016 [P] [US2] Add `trackEvent('document_moved', ...)` in `src/components/dashboard/move-document-dialog.tsx` — after successful `moveDocument()` call in `handleMove`, capture with `destination_type` property extracted from destination object
- [x] T017 [P] [US2] Add `trackEvent('file_uploaded', ...)` in `src/components/dashboard/material-upload.tsx` — after successful `createCourseMaterial()` call in `handleFile`, capture with `file_size`, `mime_type`, and `week_id` properties
- [x] T018 [P] [US2] Add `trackEvent('pdf_exported', ...)` in `src/hooks/use-export-pdf.ts` — after successful `exportDocumentAsPdf()` call in `exportPdf`, capture with `page_count` property from document pages
- [x] T019 [P] [US2] Add `trackEvent('ai_chat_message_sent', ...)` in `src/components/ai/ai-chat-panel.tsx` — after successful AI response in `handleSend`, capture with `course_id` and `mode` (quick/deep) properties
- [x] T020 [US2] Run full test suite (`pnpm test`) to verify no regressions from event tracking additions

**Checkpoint**: All 7 custom events fire with correct properties. No existing functionality is broken. Events appear in PostHog dashboard with typed properties matching contracts/custom-events.md.

---

## Phase 5: User Story 3 — Error Tracking Surfaces Application Issues (Priority: P2)

**Goal**: Unhandled JavaScript errors are automatically captured by PostHog with stack traces and linked to session recordings.

**Independent Test**: Trigger a JavaScript error in the browser console while on Typenote, then check PostHog Error Tracking section — the error should appear with stack trace and linked session recording.

**Note**: Error tracking is already enabled by Phase 1 setup (`capture_exceptions: true` in PostHogProvider clientOptions). This phase validates it works correctly.

- [x] T021 [US3] Verify error tracking configuration in `src/app/layout.tsx` — confirm `capture_exceptions: true` is set in PostHogProvider clientOptions
- [x] T022 [US3] Manual verification: open browser DevTools console on Typenote, throw a test error, check PostHog Error Tracking dashboard for the error with stack trace and linked session recording

**Checkpoint**: Errors appear in PostHog dashboard. Stack traces are visible. Errors are linked to the session recording where they occurred.

---

## Phase 6: User Story 4 — Analytics Dashboard Accessible to Team (Priority: P3)

**Goal**: PostHog project has a default dashboard showing key metrics.

**Independent Test**: Open PostHog dashboard and verify it shows real data from the application.

**Note**: This is a PostHog-side configuration task, not a code task. PostHog creates a default dashboard automatically when data starts flowing.

- [x] T023 [US4] Verify PostHog automatically created a default dashboard with active users, pageviews, and top pages widgets after data collection begins

**Checkpoint**: Team can view high-level metrics in PostHog dashboard. All free tier features are active.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Verify resilience, run full test suite, update documentation

- [x] T024 [P] Manual verification: enable an ad blocker (uBlock Origin), reload Typenote, verify all features work normally with no console errors — PostHog events silently fail (FR-010, SC-005)
- [x] T025 [P] Manual verification: block PostHog endpoints in browser DevTools Network tab, verify Typenote functions identically — graceful degradation works
- [x] T026 Run full test suite (`pnpm test`) to confirm all tests pass
- [x] T027 Run linter (`pnpm lint`) and format check (`pnpm format:check`) to confirm CI compliance
- [x] T028 Run build (`pnpm build`) to confirm production build succeeds with PostHog integration

**Checkpoint**: All tests pass. Build succeeds. App works with and without PostHog. Ready for PR.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 completion — BLOCKS all user stories
- **US1 (Phase 3)**: Depends on Phase 2 — mostly validation (already enabled by Phase 1 config)
- **US2 (Phase 4)**: Depends on Phase 2 — requires `trackEvent()` from events.ts
- **US3 (Phase 5)**: Depends on Phase 1 — mostly validation (already enabled by config)
- **US4 (Phase 6)**: Depends on Phase 1 — PostHog-side verification only
- **Polish (Phase 7)**: Depends on all user stories being complete

### User Story Dependencies

- **US1 (Session Recordings)**: Independent — enabled by PostHogProvider configuration
- **US2 (Custom Events)**: Independent — requires only the `trackEvent()` module from Phase 2
- **US3 (Error Tracking)**: Independent — enabled by `capture_exceptions: true` in config
- **US4 (Dashboard)**: Independent — PostHog-side configuration

### Within User Story 2 (Custom Events)

- T013 through T019 are ALL parallelizable — each modifies a different file
- T020 (test suite) runs after all 7 event additions are complete

### Parallel Opportunities

```
Phase 1 (sequential):
  T001 → T002 → T003 → T004

Phase 2 (partial parallel):
  T005 ─┐
  T006 ─┤→ T007 → T008 ─┐
        │         T009 ─┤→ T010
        │               │
        └───────────────┘

Phase 3-6 (after Phase 2, stories are parallelizable):
  US1 (T011-T012) ─┐
  US2 (T013-T020) ─┤→ Phase 7 (T024-T028)
  US3 (T021-T022) ─┤
  US4 (T023)      ─┘

Within US2 (all parallel except final test):
  T013 ─┐
  T014 ─┤
  T015 ─┤
  T016 ─┤→ T020
  T017 ─┤
  T018 ─┤
  T019 ─┘
```

---

## Implementation Strategy

### MVP First (US1 + US2 — Session Recordings + Events)

1. Complete Phase 1: Setup (install, env vars, middleware, provider)
2. Complete Phase 2: Foundational (events module, identify component, tests)
3. Complete Phase 3: US1 — verify session recordings work
4. Complete Phase 4: US2 — add all 7 custom events
5. **STOP and VALIDATE**: All core analytics flowing, test suite passes

### Incremental Delivery

1. Phase 1 + 2 → Analytics infrastructure ready
2. Add US1 → Session recordings flowing → Validate
3. Add US2 → All 7 custom events tracked → Validate
4. Add US3 → Error tracking active → Validate
5. Add US4 → Dashboard verified → Validate
6. Polish → Ad-blocker resilience confirmed, build passes → PR ready

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- US1 and US3 are primarily validation tasks — the actual enablement happens in Phase 1 config
- US2 is the largest phase with 7 parallel event additions
- No database migrations needed — all analytics data stored in PostHog Cloud
- All `trackEvent()` calls go after successful action completion (Promise resolution)
- Never include PII in event properties — use UUIDs and counts only
