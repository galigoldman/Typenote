# Tasks: Auth & Account Management

**Input**: Design documents from `/specs/010-auth-account-mgmt/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Tests are included — the constitution mandates test-driven quality (Principle II).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create the shared error sanitization utility that all auth pages depend on.

- [x] T001 [P] Write unit tests for auth error sanitization in `src/lib/auth-errors.test.ts` — cover mappings for: "Invalid login credentials" → "Invalid email or password", "User already registered" → "Unable to create account. Try logging in or resetting your password.", rate limit errors → "Too many attempts. Please try again later.", unknown/network errors → "Something went wrong. Please try again."
- [x] T002 [P] Create `src/lib/auth-errors.ts` — export `sanitizeAuthError(error: { message: string }): string` function that maps Supabase error messages to safe, user-friendly equivalents per the error mapping in research.md R-003
- [x] T003 Run `pnpm test src/lib/auth-errors.test.ts` to verify all error mappings pass

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Update middleware to support new auth routes before building any pages.

**CRITICAL**: No user story work can begin until this phase is complete.

- [x] T004 Update `src/lib/supabase/middleware.ts` — add `/forgot-password` to the `isAuthPage` check so unauthenticated users can access it (alongside existing `/login`, `/signup`, `/auth`)
- [x] T005 Update `src/app/auth/callback/route.ts` — read `next` query parameter from URL, validate it is a relative path starting with `/` (prevent open redirect), and redirect to `next` after successful code exchange (default: `/dashboard`)
- [x] T006 Write unit tests for the callback route in `src/app/auth/callback/route.test.ts` — test: OAuth code exchange redirects to `/dashboard` (existing behavior), recovery code with `?next=/reset-password` redirects to `/reset-password`, invalid `next` param (absolute URL, external domain) falls back to `/dashboard`, missing code param redirects to `/login?error=auth_failed`
- [x] T007 Run `pnpm test` to verify foundation changes pass and nothing is broken

**Checkpoint**: Middleware and callback ready — user story implementation can now begin.

---

## Phase 3: User Story 1 — Password Reset via Email (Priority: P1) MVP

**Goal**: A user who forgot their password can reset it via an emailed link — the complete forgot-password → email → reset-password → login flow.

**Independent Test**: Create user, click "Forgot password?", follow emailed link (via Inbucket at localhost:54324), set new password, log in with new password.

### Tests for User Story 1

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T008 [P] [US1] Write tests for forgot-password page in `src/app/(auth)/forgot-password/page.test.tsx` — test: renders email input and submit button, shows "Check your email" confirmation after submission (regardless of email existence), shows loading state during submission, has link back to login page
- [x] T009 [P] [US1] Write tests for reset-password page in `src/app/(auth)/reset-password/page.test.tsx` — test: renders new password and confirm password inputs, validates passwords match before submission, validates minimum 6 character length, calls `supabase.auth.updateUser({ password })` on submit, redirects to `/login?message=password-reset-success` on success, shows sanitized error on failure with link to request new reset

### Implementation for User Story 1

- [x] T010 [US1] Create forgot-password page in `src/app/(auth)/forgot-password/page.tsx` — client component with email input, submit calls `supabase.auth.resetPasswordForEmail(email, { redirectTo: origin + '/auth/callback?next=/reset-password' })`, always shows "Check your email" confirmation after submit (never reveals if email exists), loading state during submission, link back to login
- [x] T011 [US1] Create reset-password page in `src/app/(auth)/reset-password/page.tsx` — client component with new password + confirm password inputs, client-side validation (min 6 chars, passwords match), calls `supabase.auth.updateUser({ password })`, on success redirects to `/login?message=password-reset-success`, on error shows `sanitizeAuthError()` message + "Request a new reset link" link to `/forgot-password`
- [x] T012 [US1] Run `pnpm test src/app/(auth)/forgot-password/page.test.tsx src/app/(auth)/reset-password/page.test.tsx` to verify US1 tests pass

**Checkpoint**: Password reset flow works end-to-end. Can be tested with local Supabase Inbucket.

---

## Phase 4: User Story 2 — Robust Signup Flow (Priority: P2)

**Goal**: Harden the existing signup page — sanitize error messages to prevent email enumeration, ensure all validation gives clear inline feedback.

**Independent Test**: Attempt signup with valid data (success), duplicate email (generic error), short password (inline error), empty fields (inline errors).

### Tests for User Story 2

- [x] T013 [US2] Update tests in `src/app/(auth)/signup/page.test.tsx` — add new test cases: verify Supabase "User already registered" error is never exposed (mapped to "Unable to create account. Try logging in or resetting your password."), verify network errors show "Something went wrong. Please try again.", verify rate limit errors show "Too many attempts. Please try again later."

### Implementation for User Story 2

- [x] T014 [US2] Update `src/app/(auth)/signup/page.tsx` — replace `setError(error.message)` with `setError(sanitizeAuthError(error))` using the utility from `src/lib/auth-errors.ts`, import `sanitizeAuthError`
- [x] T015 [US2] Run `pnpm test src/app/(auth)/signup/page.test.tsx` to verify US2 tests pass

**Checkpoint**: Signup no longer leaks email existence. All errors are user-friendly.

---

## Phase 5: User Story 3 — Robust Login Flow (Priority: P3)

**Goal**: Add "Forgot password?" link, sanitize error messages, show success banner after password reset.

**Independent Test**: Log in with wrong password (generic error), click "Forgot password?" link (navigates to `/forgot-password`), complete reset then verify success banner on login page.

### Tests for User Story 3

- [x] T016 [US3] Update tests in `src/app/(auth)/login/page.test.tsx` — add new test cases: verify "Forgot password?" link renders and points to `/forgot-password`, verify Supabase errors are sanitized (not raw), verify success banner appears when URL has `?message=password-reset-success`, verify banner does not appear without the query param

### Implementation for User Story 3

- [x] T017 [US3] Update `src/app/(auth)/login/page.tsx` — add "Forgot password?" link below the password field (navigating to `/forgot-password`), replace `setError(error.message)` with `setError(sanitizeAuthError(error))`, read `searchParams` for `?message=password-reset-success` and show a success banner ("Password reset successfully. Please sign in with your new password.")
- [x] T018 [US3] Run `pnpm test src/app/(auth)/login/page.test.tsx` to verify US3 tests pass

**Checkpoint**: Login page is hardened with forgot-password link, sanitized errors, and reset success feedback.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Full suite verification and lint compliance.

- [x] T019 Run full test suite `pnpm test` to confirm all unit tests pass across all auth pages
- [x] T020 Run linting `pnpm lint` and fix any issues in new/modified files
- [x] T021 Run format check `pnpm format:check` and fix any formatting issues
- [ ] T022 Manual smoke test: walk through the complete password reset flow using Supabase Inbucket at `localhost:54324` — verify email arrives, link works, new password sets, login succeeds
- [ ] T023 Run quickstart.md manual testing checklist (all items in `specs/010-auth-account-mgmt/quickstart.md`)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Can start in parallel with Phase 1 (T004-T006 don't depend on T001-T002), but T007 should run after both phases
- **User Stories (Phase 3+)**: All depend on Phase 1 (auth-errors utility) and Phase 2 (middleware + callback)
  - US1 (Phase 3): Builds new pages — core MVP
  - US2 (Phase 4): Modifies existing signup — independent of US1
  - US3 (Phase 5): Modifies existing login — independent of US2 but benefits from US1 (forgot-password page must exist for the link)
- **Polish (Phase 6)**: Depends on all user stories being complete

### User Story Dependencies

- **US1 (P1)**: Can start after Phases 1+2. No dependency on other stories.
- **US2 (P2)**: Can start after Phases 1+2. No dependency on US1 or US3.
- **US3 (P3)**: Can start after Phases 1+2. The "Forgot password?" link requires the `/forgot-password` route from US1 to exist, but the login page changes themselves are independent.

### Within Each User Story

- Tests MUST be written and FAIL before implementation
- Implementation follows: page component → verify tests pass
- Commit after each task or logical group

### Parallel Opportunities

- T001 + T002 can run in parallel (test file + implementation file)
- T004 + T005 + T006 can run in parallel (middleware, callback, callback tests — different files)
- T008 + T009 can run in parallel (forgot-password tests + reset-password tests)
- US2 and US3 can be worked on in parallel (different files: signup vs. login)

---

## Parallel Example: User Story 1

```bash
# Launch tests for US1 in parallel:
Task: "Write tests for forgot-password page in src/app/(auth)/forgot-password/page.test.tsx"
Task: "Write tests for reset-password page in src/app/(auth)/reset-password/page.test.tsx"

# Then implement pages (can also run in parallel — different files):
Task: "Create forgot-password page in src/app/(auth)/forgot-password/page.tsx"
Task: "Create reset-password page in src/app/(auth)/reset-password/page.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (error sanitization utility)
2. Complete Phase 2: Foundational (middleware + callback)
3. Complete Phase 3: User Story 1 (forgot-password + reset-password pages)
4. **STOP and VALIDATE**: Test full reset flow with Inbucket
5. This alone delivers the most critical missing auth feature

### Incremental Delivery

1. Setup + Foundational → Shared infrastructure ready
2. US1: Password Reset → Test independently → Core auth gap filled (MVP!)
3. US2: Harden Signup → Test independently → No more email enumeration on signup
4. US3: Harden Login → Test independently → Forgot password link + sanitized login errors
5. Polish → Full suite green, lint clean, manual smoke test

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story is independently completable and testable
- Tests MUST fail before implementation (TDD per constitution Principle II)
- Commit after each task or logical group
- No database migrations needed — all changes are in the application layer
- Supabase Inbucket (localhost:54324) captures emails locally for manual testing
