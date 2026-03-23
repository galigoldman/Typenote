# Research: PostHog Analytics Integration

**Feature**: 014-posthog-analytics
**Date**: 2026-03-23

## R1: PostHog SDK for Next.js App Router

**Decision**: Use `@posthog/next` — the unified PostHog package for Next.js.

**Rationale**: This is the official modern package that replaces the older manual `posthog-js` + custom provider pattern. It provides:

- `PostHogProvider` (server component) — wraps the app in `layout.tsx`
- `PostHogPageView` — handles client-side App Router navigations
- `usePostHog()` hook — typed client access in client components
- `getPostHog()` — server-side capture scoped per-request via `AsyncLocalStorage`
- `postHogMiddleware()` — identity cookie seeding + optional API proxy

**Alternatives considered**:

- Raw `posthog-js` + manual provider: More boilerplate, no server-side support, no middleware composition. Rejected because `@posthog/next` bundles everything.
- Google Analytics: Doesn't offer session recordings or error tracking in free tier. Rejected per spec requirements.

## R2: Middleware Composition

**Decision**: Compose `postHogMiddleware` with the existing Supabase auth middleware.

**Rationale**: Typenote already has `src/middleware.ts` that calls `updateSession()` for Supabase auth. PostHog's `postHogMiddleware()` supports receiving a `response` parameter for composition. The pattern:

1. Supabase middleware runs first (session refresh)
2. PostHog middleware runs second (identity cookie seeding + proxy routing)

**Alternatives considered**:

- Replacing middleware entirely: Would break auth. Rejected.
- Skipping PostHog middleware: Would lose ad-blocker proxy and identity cookies. Rejected.

## R3: Event Tracking Architecture (Client-Side vs Server-Side)

**Decision**: Track all 7 custom domain events **client-side** using `posthog.capture()` in the components/hooks that trigger the actions.

**Rationale**:

- All tracked actions originate from user interactions in the browser
- The client knows when a server action succeeds (Promise resolution) — capture there
- Keeps analytics code separate from business logic in server actions
- Avoids importing PostHog server SDK into every server action file
- Client-side capture is automatically linked to the session recording

**Alternatives considered**:

- Server-side capture in server actions using `getPostHog()`: More tightly coupled, mixes analytics with business logic, and doesn't automatically link to session recordings. Rejected.
- Hybrid (some client, some server): Inconsistent pattern, harder to maintain. Rejected.

## R4: Custom Event Strategy

**Decision**: Create a centralized `src/lib/analytics/events.ts` module with typed event definitions and a single `trackEvent()` wrapper.

**Rationale**:

- Type safety: TypeScript discriminated union ensures event names and properties are always paired correctly
- Single import: Components call `trackEvent('document_created', { ... })` instead of raw `posthog.capture`
- Testability: Easy to mock `trackEvent` in tests without mocking PostHog internals
- Graceful degradation: The wrapper can check `typeof window !== 'undefined'` and swallow errors if PostHog is blocked

**7 custom events**:
| Event Name | Trigger Location | Properties |
|---|---|---|
| `document_created` | Dashboard create dialog components | `course_id`, `document_type`, `purpose` |
| `document_deleted` | Document card context menu | `document_id` |
| `file_uploaded` | `use-file-upload.ts` hook | `file_size`, `mime_type`, `week_id` |
| `ai_chat_message_sent` | `ai-chat-panel.tsx` | `course_id`, `mode` (quick/deep) |
| `pdf_exported` | `use-export-pdf.ts` hook | `page_count` |
| `course_created` | Course creation dialog | `course_name_length` |
| `document_moved` | Move document dialog | `destination_type` (folder/course/root) |

## R5: User Identification Strategy

**Decision**: Identify users by Supabase auth UUID via a dedicated `PostHogIdentify` client component placed inside the PostHogProvider.

**Rationale**:

- Uses the existing Supabase client-side auth state (`supabase.auth.getUser()` or session listener)
- UUID is not PII — satisfies FR-009
- Calls `posthog.identify(user.id)` on auth state change
- Calls `posthog.reset()` on sign-out to unlink sessions

**Alternatives considered**:

- Server-side identification in middleware: Adds complexity; the Supabase middleware already runs, and PostHog's middleware handles its own identity cookie. Rejected.
- Passing user ID from server component as prop: Works but requires prop drilling. The client Supabase SDK already has the session. Rejected.

## R6: Privacy & Masking Configuration

**Decision**: Use PostHog's default `maskAllInputs: true` for session recordings. No custom masking selectors needed.

**Rationale**:

- Default input masking covers passwords, form fields, and editor text inputs
- The TipTap editor uses a contenteditable div (not a standard `<input>`), so it is **not** masked by `maskAllInputs` — this is intentional, as note content layout is useful for UX analysis while actual typed text is masked at the input level
- If stricter masking is needed later, `maskTextSelector` or `blockSelector` can be added without code changes (just config update)

## R7: Ad-Blocker Resilience via API Proxy

**Decision**: Enable `proxy: true` in `postHogMiddleware()` to route PostHog API calls through `/ingest/*` on the app's own domain.

**Rationale**:

- Ad blockers commonly block requests to `us.i.posthog.com` and `eu.i.posthog.com`
- The proxy rewrites `/ingest/*` → PostHog's ingest servers, making requests appear as first-party
- This significantly increases data capture rate (some studies show 10-30% of users have ad blockers)
- FR-010 still applies: if even the proxy fails, the app continues normally

## R8: Environment Variables

**Decision**: Two environment variables, both prefixed with `NEXT_PUBLIC_` (client-exposed):

| Variable                   | Value                      | Purpose                                                           |
| -------------------------- | -------------------------- | ----------------------------------------------------------------- |
| `NEXT_PUBLIC_POSTHOG_KEY`  | `phc_...`                  | PostHog project API key                                           |
| `NEXT_PUBLIC_POSTHOG_HOST` | `https://us.i.posthog.com` | PostHog ingest endpoint (used as fallback; proxy handles primary) |

These will be added to `.env.local.example` and documented.

## R9: Testing Strategy

**Decision**: Test at two levels:

1. **Unit tests (Vitest + jsdom)**:
   - `PostHogIdentify` component renders without errors and calls identify on mount
   - `trackEvent()` wrapper calls `posthog.capture` with correct event name/properties
   - `trackEvent()` does not throw when PostHog is unavailable (graceful degradation)
   - PostHog provider renders children correctly

2. **Manual verification** (not automated):
   - Session recordings visible in PostHog dashboard
   - Custom events appear with correct properties
   - Error tracking captures test exceptions
   - App works when PostHog is blocked (disable in browser DevTools)

**Rationale**: PostHog's own SDK behavior (network calls, recording, error capture) is best tested manually against the real service. Unit tests verify our integration code — the wrapper, the provider setup, and graceful degradation.
