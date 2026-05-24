# Tasks: Google Sign-Up as Only Registration Option

**Input**: Design documents from `/specs/042-google-signup/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md

**Tests**: Required per CLAUDE.md — unit tests (Vitest) and E2E tests (Playwright) for every feature.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: User Story 1 - New User Signs Up with Google (Priority: P1) MVP

**Goal**: Replace the email/password signup form with a single "Sign up with Google" button. New Google users get full accounts.

**Independent Test**: Visit `/signup`, verify only Google button is shown, click it, complete OAuth, land on dashboard with profile.

### Tests for User Story 1

- [x] T001 [P] [US1] Write unit test: signup page renders only Google button (no email/password form) in `src/app/(auth)/signup/page.test.tsx`
- [x] T002 [P] [US1] Write unit test: signup page shows error message when `error` query param is present in `src/app/(auth)/signup/page.test.tsx`
- [x] T003 [P] [US1] Write unit test: signup page links to login page in `src/app/(auth)/signup/page.test.tsx`

### Implementation for User Story 1

- [x] T004 [US1] Replace signup page with Google-only UI: remove email/password/display-name form, keep Google OAuth button, add error handling for failed OAuth in `src/app/(auth)/signup/page.tsx`

**Checkpoint**: Signup page shows only "Sign up with Google" button. Unit tests pass. Existing OAuth callback route works unchanged.

---

## Phase 2: User Story 2 - Existing Email/Password User Continues Logging In (Priority: P1)

**Goal**: Verify existing email/password login is unaffected. No code changes — login page is NOT modified.

**Independent Test**: Log in with `test@typenote.dev` / `Test1234`, verify dashboard loads with all data.

### Verification for User Story 2

- [x] T005 [US2] Verify login page is unchanged: confirm email/password form AND Google button both remain in `src/app/(auth)/login/page.tsx` (read-only check, no modifications)

**Checkpoint**: Login page unchanged. Existing email/password login works.

---

## Phase 3: User Story 3 - Existing User Logs In with Google (Priority: P2)

**Goal**: Verify existing Google sign-in on the login page works. No code changes — already implemented.

**Independent Test**: Click "Sign in with Google" on login page, verify authentication and redirect to dashboard.

### Verification for User Story 3

- [x] T006 [US3] Verify Google sign-in button on login page still calls `signInWithOAuth` with correct callback URL in `src/app/(auth)/login/page.tsx` (read-only check, no modifications)

**Checkpoint**: Google sign-in on login page works for existing users.

---

## Phase 4: E2E Tests & Polish

**Purpose**: E2E browser tests and test registry update

- [x] T007 Update E2E test registry with Google signup scenarios in `e2e/TEST_REGISTRY.md`
- [x] T008 Write E2E test: signup page shows only Google button (no email/password form) in `e2e/auth.spec.ts`
- [x] T009 Write E2E test: login page still shows both email/password and Google options in `e2e/auth.spec.ts`
- [x] T010 Run full test suite: `pnpm test && pnpm test:integration && pnpm test:e2e`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (US1)**: No dependencies — can start immediately (no setup/foundational phase needed)
- **Phase 2 (US2)**: Independent of Phase 1 — read-only verification
- **Phase 3 (US3)**: Independent of Phase 1 — read-only verification
- **Phase 4 (E2E/Polish)**: Depends on Phase 1 completion (signup page must be modified before E2E tests)

### User Story Dependencies

- **User Story 1 (P1)**: No dependencies — only modifies `signup/page.tsx` and its test
- **User Story 2 (P1)**: No dependencies — read-only verification of `login/page.tsx`
- **User Story 3 (P2)**: No dependencies — read-only verification of `login/page.tsx`

### Within User Story 1

- T001, T002, T003 (tests) can run in parallel — all write to the same test file but test different behaviors
- T004 (implementation) should run after tests are written (TDD approach)

### Parallel Opportunities

- T001, T002, T003 can run in parallel (different test cases, same file but independent)
- T005 and T006 can run in parallel with Phase 1 (read-only checks on different file)
- T008 and T009 can run in parallel (different E2E test cases)

---

## Parallel Example: User Story 1

```bash
# Launch all unit tests for US1 together:
Task: "Write unit test: signup page renders only Google button in src/app/(auth)/signup/page.test.tsx"
Task: "Write unit test: signup page shows error on failed OAuth in src/app/(auth)/signup/page.test.tsx"
Task: "Write unit test: signup page links to login page in src/app/(auth)/signup/page.test.tsx"

# Then implement:
Task: "Replace signup page with Google-only UI in src/app/(auth)/signup/page.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Write failing unit tests for Google-only signup page (T001-T003)
2. Implement Google-only signup page (T004)
3. **STOP and VALIDATE**: Run `pnpm test` — all unit tests pass
4. Verify login page unchanged (T005-T006)
5. Write E2E tests and run full suite (T007-T010)

### Single Developer Flow

1. T001-T003 → Write unit tests (they fail)
2. T004 → Implement signup page change (tests pass)
3. T005-T006 → Verify login page untouched
4. T007-T009 → Write E2E tests
5. T010 → Run full test suite, confirm green

---

## Notes

- This feature has no database changes, no new dependencies, and no setup/foundational phase
- The core implementation is a single file change (`signup/page.tsx`)
- US2 and US3 are verification-only — they confirm existing functionality isn't broken
- Total: 10 tasks, of which only 1 (T004) is actual implementation code
