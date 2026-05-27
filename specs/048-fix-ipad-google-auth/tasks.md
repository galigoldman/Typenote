# Tasks: Fix iPad Google OAuth Sign-In

**Input**: Design documents from `/specs/048-fix-ipad-google-auth/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: Included per CLAUDE.md testing requirements (unit tests with Vitest, E2E with Playwright).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup

**Purpose**: Verify development environment and understand current behavior

- [x] T001 Verify local Supabase is running with Google OAuth enabled by checking `supabase/config.toml` `[auth.external.google]` section and running `supabase status`
- [x] T002 Read and understand the current OAuth flow in `src/app/(auth)/signup/page.tsx`, `src/app/(auth)/login/page.tsx`, and `src/app/auth/callback/route.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Create shared OAuth redirect utility that both signup and login pages will use

**CRITICAL**: No user story work can begin until this phase is complete

- [x] T003 Create a shared Safari-compatible OAuth redirect helper function that uses `signInWithOAuth` with `skipBrowserRedirect: true` and manually assigns `window.location.href` — place in `src/lib/supabase/oauth.ts`
- [x] T004 Write unit tests for the OAuth redirect helper in `src/lib/supabase/oauth.test.ts` — test that it calls `signInWithOAuth` with `skipBrowserRedirect: true` and assigns `window.location.href` to the returned URL

**Checkpoint**: Foundation ready — shared OAuth helper exists and is tested

---

## Phase 3: User Story 1 — Google Sign-In Shows Account Picker on iPad (Priority: P1)

**Goal**: Tapping the Google button on iPad Safari reliably navigates to Google's OAuth consent screen where the user can select a Google account.

**Independent Test**: Open signup or login page on iPad Safari (or simulator), tap Google button, verify Google account picker appears.

### Tests for User Story 1

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T005 [P] [US1] Update unit test in `src/app/(auth)/signup/page.test.tsx` — test that the Google button calls the new OAuth helper instead of directly calling `signInWithOAuth`
- [x] T006 [P] [US1] Update unit test in `src/app/(auth)/login/page.test.tsx` — test that the Google button calls the new OAuth helper instead of directly calling `signInWithOAuth`

### Implementation for User Story 1

- [x] T007 [P] [US1] Refactor `handleGoogleSignup` in `src/app/(auth)/signup/page.tsx` to use the shared Safari-compatible OAuth redirect helper from `src/lib/supabase/oauth.ts`
- [x] T008 [P] [US1] Refactor `handleGoogleLogin` in `src/app/(auth)/login/page.tsx` to use the shared Safari-compatible OAuth redirect helper from `src/lib/supabase/oauth.ts`
- [x] T009 [US1] Run `pnpm test` to verify all unit tests pass for both signup and login pages

**Checkpoint**: Google OAuth redirect works reliably on iPad Safari — account picker appears

---

## Phase 4: User Story 2 — OAuth Callback Completes Successfully on Safari (Priority: P1)

**Goal**: The `/auth/callback` route handles PKCE failures gracefully — no silent new-user creation, clear error messaging on failure.

**Independent Test**: Simulate a callback with an invalid/missing code and verify the user sees an error on the login page, not a blank workspace.

### Tests for User Story 2

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T010 [US2] Add unit test in `src/app/auth/callback/route.test.ts` — test that when `exchangeCodeForSession` fails, the redirect includes a descriptive error parameter (not just `auth_failed`)
- [x] T011 [US2] Add unit test in `src/app/auth/callback/route.test.ts` — test that when no `code` parameter is provided AND no error params exist, the redirect goes to `/login?error=no_code`

### Implementation for User Story 2

- [x] T012 [US2] Improve error handling in `src/app/auth/callback/route.ts` — log the specific error from `exchangeCodeForSession` and pass a more descriptive error type to the login page redirect (e.g., `session_exchange_failed` vs `no_code`)
- [x] T013 [US2] Update the error display in `src/app/(auth)/login/page.tsx` to show a user-friendly message when redirected with `error=session_exchange_failed` (e.g., "Sign-in failed. Please try again. If this keeps happening, try clearing your browser cookies.")
- [x] T014 [US2] Update the error display in `src/app/(auth)/signup/page.tsx` to handle the error query parameter from failed callbacks (redirect after failed Google OAuth should show an actionable message)
- [x] T015 [US2] Run `pnpm test` to verify all unit tests pass

**Checkpoint**: Callback route handles all failure modes gracefully — no silent failures

---

## Phase 5: User Story 3 — Consistent Google Auth Across All Devices (Priority: P2)

**Goal**: Google sign-in works identically on desktop Chrome, iPad Safari, iPhone Safari, and Android Chrome with no regressions.

**Independent Test**: Run the Google sign-in flow on desktop Chrome and verify no regressions from the Safari-specific fixes.

### Tests for User Story 3

- [x] T016 [US3] Update E2E test registry in `e2e/TEST_REGISTRY.md` with Google OAuth test scenarios (noting that real Google OAuth can't be fully E2E tested — test the redirect initiation and callback error handling)
- [x] T017 [US3] Write E2E tests in `e2e/auth.spec.ts` — test callback error path (navigate to `/auth/callback` without code, verify error redirect) and login error display (navigate to `/login?error=session_exchange_failed`, verify error message)

### Implementation for User Story 3

- [x] T018 [US3] Verify the shared OAuth helper in `src/lib/supabase/oauth.ts` works correctly on desktop by running unit tests — no iPad-specific branches that break desktop flow
- [x] T019 [US3] Run the full unit test suite to confirm no regressions (97/99 files pass, 2 pre-existing failures unrelated to this change)

**Checkpoint**: All user stories work independently, no cross-device regressions

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final cleanup and verification

- [x] T020 Run `pnpm lint && pnpm format:check` and fix any formatting/lint issues
- [ ] T021 Run the full test suite one final time: `pnpm test && pnpm test:integration && pnpm test:e2e`
- [ ] T022 Verify the fix manually on iPad Safari (if device available) — tap Google button, confirm account picker appears, complete sign-in, verify dashboard shows user data

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational (Phase 2) — can start immediately after
- **User Story 2 (Phase 4)**: Depends on Foundational (Phase 2) — can run in parallel with US1
- **User Story 3 (Phase 5)**: Depends on US1 and US2 completion — cross-device regression check
- **Polish (Phase 6)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) — No dependencies on other stories
- **User Story 2 (P1)**: Can start after Foundational (Phase 2) — Independent of US1, shares callback route
- **User Story 3 (P2)**: Depends on US1 and US2 — regression testing requires both fixes to be in place

### Within Each User Story

- Tests MUST be written and FAIL before implementation
- Implementation tasks marked [P] within a story can run in parallel
- Run test suite at each checkpoint

### Parallel Opportunities

- T005 and T006 (US1 tests for signup and login pages) can run in parallel
- T007 and T008 (US1 implementation for signup and login pages) can run in parallel
- US1 (Phase 3) and US2 (Phase 4) can run in parallel after Foundational phase

---

## Parallel Example: User Story 1

```bash
# Launch signup and login test updates in parallel:
Task: "Update unit test for signup page in src/app/(auth)/signup/page.test.tsx"
Task: "Update unit test for login page in src/app/(auth)/login/page.test.tsx"

# Launch signup and login implementation in parallel:
Task: "Refactor handleGoogleSignup in src/app/(auth)/signup/page.tsx"
Task: "Refactor handleGoogleLogin in src/app/(auth)/login/page.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (shared OAuth helper)
3. Complete Phase 3: User Story 1 (fix redirect on both pages)
4. **STOP and VALIDATE**: Test on iPad Safari — does the Google account picker appear?
5. If yes, proceed to US2 for error handling hardening

### Incremental Delivery

1. Setup + Foundational → OAuth helper ready
2. Add User Story 1 → Test on iPad → Google picker appears (MVP!)
3. Add User Story 2 → Test callback errors → Clear error messages on failure
4. Add User Story 3 → Cross-device regression check → No breakage
5. Each story adds value without breaking previous stories

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Real Google OAuth cannot be fully E2E tested (requires Google credentials) — E2E tests cover redirect initiation and error paths only
- The core fix is small (~50 lines) but touches auth-critical code — thorough testing is essential
- Commit after each phase checkpoint
