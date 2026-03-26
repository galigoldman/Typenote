# Tasks: Safe Development Workflow

**Input**: Design documents from `/specs/028-safe-dev-workflow/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, quickstart.md

**Tests**: No automated tests for this feature — it IS the testing infrastructure.

**Organization**: Tasks are grouped by user story. US1+US2 are combined because they both depend on the same branch/CI changes.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup

**Purpose**: Create the `dev` branch from current `main`

- [x] T001 Create `dev` branch from `main` by running `git branch dev main && git push origin dev`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Update CI to trigger on `dev` branch — MUST be complete before any other work matters

**CRITICAL**: No user story work can begin until this phase is complete

- [x] T002 Update `.github/workflows/ci.yml` — add `dev` to `on.push.branches` and `on.pull_request.branches` arrays so CI runs on PRs to both `main` and `dev`

**Checkpoint**: CI now triggers on PRs to `dev`. Verify by pushing the branch and checking GitHub Actions.

---

## Phase 3: User Stories 1+2 — Safe Branch Workflow (Priority: P1)

**Goal**: Feature branches go to `dev` via PR (CI gates), then `dev` goes to `main` via PR (CI gates again). No direct pushes to `main`.

**Independent Test**: Open a PR from a test branch to `dev`, confirm CI runs. Then open a PR from `dev` to `main`, confirm CI runs again.

### Implementation

- [x] T003 [US1] Add Playwright browser install step to `.github/workflows/ci.yml` — add step `pnpm exec playwright install --with-deps chromium` after the Build step
- [x] T004 [US1] Add E2E test run step to `.github/workflows/ci.yml` — run `pnpm test:e2e` with env vars `TEST_USER_EMAIL=test@typenote.dev`, `TEST_USER_PASSWORD=Test1234`, and Supabase URL/key from the existing extracted variables
- [x] T005 [US1] Add Playwright artifact upload step to `.github/workflows/ci.yml` — upload `playwright-report/` directory using `actions/upload-artifact@v4` with condition `if: failure()` and `retention-days: 7`

**Checkpoint**: CI pipeline now includes E2E tests. PRs to both `dev` and `main` run the full suite: lint, format, unit, integration, E2E, build.

---

## Phase 4: User Story 3 — Reliable E2E in CI (Priority: P1)

**Goal**: E2E tests never skip, use real auth flows, and produce screenshots on failure.

**Independent Test**: Run `pnpm test:e2e` locally — all tests execute (zero skipped). Check that a deliberately failing test produces a screenshot in `test-results/`.

### Implementation

- [x] T006 [US3] Add `screenshot: 'only-on-failure'` to the `use` block in `playwright.config.ts` (FR-006)
- [x] T007 [US3] Create shared login helper at `e2e/helpers/auth.ts` — export `async function login(page: Page)` that navigates to `/login`, fills email/password from env vars with fallback defaults (`test@typenote.dev` / `Test1234`), clicks sign in, and waits for dashboard URL
- [x] T008 [US3] Fix `e2e/export-pdf-dashboard.spec.ts` — remove `test.skip` block (lines 8-10), import `login` from `e2e/helpers/auth.ts`, replace inline login code in `beforeEach` with shared helper
- [x] T009 [US3] Fix `e2e/realtime-sync.spec.ts` — remove `test.skip` block (lines 36-39), import `login` from `e2e/helpers/auth.ts`, replace inline `login` function with shared helper, replace `TEST_DOC_URL` env var usage with a URL derived from seeded test document ID (`ac3be77d-4566-406c-9ac0-7c410634ad41` user's first document)

**Checkpoint**: `pnpm test:e2e` runs all 4 test files with zero skipped tests. Screenshots appear in `test-results/` on failure.

---

## Phase 5: User Story 4 — Test Registry (Priority: P2)

**Goal**: A single file lists every feature and its required E2E test scenarios, showing what's covered and what's missing.

**Independent Test**: Open `e2e/TEST_REGISTRY.md` and verify every application feature is listed with specific test scenarios. Cross-reference with `e2e/*.spec.ts` files to confirm implemented vs not-yet-implemented markers are accurate.

### Implementation

- [ ] T010 [US4] Create `e2e/TEST_REGISTRY.md` with sections for every application feature: Auth, Documents, Canvas Editor, Text Editor Toolbar, LaTeX Math, Courses, File Upload, AI Chat, PDF Export, Real-time Sync. Each section lists the target spec file, implementation status, and specific test scenarios as checkboxes. Mark existing tests as implemented, all others as NOT YET IMPLEMENTED.

**Checkpoint**: Registry exists, is comprehensive, and accurately reflects current test coverage.

---

## Phase 6: User Story 5 — CLAUDE.md + Constitution Enforcement (Priority: P2)

**Goal**: Future Claude sessions automatically enforce E2E testing discipline. Rules are specific, not vague.

**Independent Test**: Read CLAUDE.md in a fresh conversation — Claude should know about the test registry, know to write real E2E tests (not mock page tests), and ask about E2E scenarios for new features.

### Implementation

- [ ] T011 [P] [US5] Replace "Testing Best Practices" section in `CLAUDE.md` with specific E2E testing rules: (1) every feature MUST have E2E tests against real user flows, not `/test/*` pages, (2) check and update `e2e/TEST_REGISTRY.md` before completing any feature, (3) ask about E2E scenarios if user doesn't mention them, (4) use shared login helper from `e2e/helpers/auth.ts`, (5) never use `test.skip` for env vars, (6) run all test levels after code changes
- [ ] T012 [P] [US5] Update "Git Workflow" section in `CLAUDE.md` — change "create branch off `main`" to "create branch off `dev`", document the feature → `dev` → `main` flow, document the `dev` sync procedure when `main` gets ahead
- [ ] T013 [US5] Amend `.specify/memory/constitution.md` — MINOR version bump 1.1.0 → 1.2.0: update Principle III to say "branch off `dev`" instead of "branch off `main`", add `dev` as protected branch, update CI Pipeline section to include E2E step (step 7: `pnpm test:e2e`)

**Checkpoint**: CLAUDE.md rules are specific and actionable. Constitution is consistent with CLAUDE.md and CI workflow. No contradictions between documents.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Branch protection and final verification

- [ ] T014 Configure GitHub branch protection for `dev` via `gh` CLI — require status checks to pass before merging (same rules as `main`)
- [ ] T015 Verify end-to-end: push this feature branch as a PR to `dev`, confirm CI runs all checks including E2E, confirm zero skipped tests, confirm artifacts upload works on failure
- [ ] T016 Update `specs/028-safe-dev-workflow/quickstart.md` with any adjustments discovered during implementation

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 (dev branch must exist)
- **US1+US2 (Phase 3)**: Depends on Phase 2 (CI must trigger on dev)
- **US3 (Phase 4)**: Depends on Phase 3 (E2E step must exist in CI for tests to run there)
- **US4 (Phase 5)**: Can start after Phase 2 (independent of CI changes — it's a documentation file)
- **US5 (Phase 6)**: Can start after Phase 2 (independent — it's documentation updates)
- **Polish (Phase 7)**: Depends on all previous phases

### User Story Dependencies

- **US1+US2 (P1)**: Depends on Foundational. Core workflow — must be done first.
- **US3 (P1)**: Depends on US1+US2. E2E tests need the CI pipeline changes to exist.
- **US4 (P2)**: Can start after Foundational. Independent — it's a markdown file.
- **US5 (P2)**: Can start after Foundational. Independent — it's config file updates.

### Parallel Opportunities

- T011 and T012 can run in parallel (different sections of CLAUDE.md)
- Phase 5 (US4) can run in parallel with Phase 3 (US1+US2) and Phase 4 (US3)
- Phase 6 (US5) can run in parallel with Phase 3 and Phase 4

---

## Parallel Example: Phases 3-6

```
After Phase 2 completes:

Sequential track (must be in order):
  T003 → T004 → T005 (CI pipeline changes)
  Then: T006 → T007 → T008 → T009 (E2E reliability)

Parallel track (can run alongside sequential track):
  T010 (test registry — just a markdown file)
  T011 + T012 (CLAUDE.md updates — parallel, different sections)
  T013 (constitution — independent file)
```

---

## Implementation Strategy

### MVP First (Phases 1-4)

1. Complete Phase 1: Create `dev` branch
2. Complete Phase 2: CI triggers on `dev`
3. Complete Phase 3: E2E in CI pipeline
4. Complete Phase 4: Fix existing E2E tests
5. **STOP and VALIDATE**: Push a PR to `dev`, confirm full CI passes with E2E

### Incremental Delivery

1. Phases 1-4 → CI pipeline works with E2E → **Core safety is live**
2. Phase 5 → Test registry exists → **Coverage gaps are visible**
3. Phase 6 → CLAUDE.md enforces rules → **Future work is automatically safe**
4. Phase 7 → Branch protection + verification → **Everything locked down**

---

## Notes

- No new npm dependencies to install — Playwright is already in `package.json`
- Supabase test user already exists in `seed.sql` — no seed changes needed
- The `e2e/helpers/` directory is new and needs to be created
- All file paths are relative to repository root
- Commit after each task or logical group of tasks
