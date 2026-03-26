# Implementation Plan: Safe Development Workflow

**Branch**: `028-safe-dev-workflow` | **Date**: 2026-03-26 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/028-safe-dev-workflow/spec.md`

## Summary

Set up a two-branch workflow (`dev` + `main`) with full E2E browser testing in CI. Currently, Playwright E2E tests either skip or test fake pages, and there's no integration branch. This plan adds: `dev` branch with protection, Playwright running in CI against local Supabase, a test registry for tracking E2E coverage, and specific CLAUDE.md rules to enforce testing discipline.

## Technical Context

**Language/Version**: TypeScript 5 / Node.js 20+ (CI) / 22+ (local)
**Primary Dependencies**: Playwright (E2E), Vitest (unit/integration), GitHub Actions (CI), Supabase CLI
**Storage**: N/A — no schema changes, uses existing seeded data in local Supabase
**Testing**: Vitest (unit + integration), Playwright (E2E) — adding E2E to CI pipeline
**Target Platform**: GitHub Actions (ubuntu-latest CI runner)
**Project Type**: Web application (Next.js 16) — infrastructure/workflow changes only
**Performance Goals**: CI pipeline completes in under 10 minutes including E2E
**Constraints**: GitHub Actions free tier limits, local Supabase must be running for E2E
**Scale/Scope**: 6 files modified/created, no new dependencies to install

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

### Pre-research check

| Principle                       | Status           | Notes                                                               |
| ------------------------------- | ---------------- | ------------------------------------------------------------------- |
| I. Incremental Development      | PASS             | Infrastructure change, no feature skip                              |
| II. Test-Driven Quality         | PASS             | This feature directly enhances test coverage                        |
| III. Protected Main Branch      | AMENDMENT NEEDED | Currently says "branch off `main`" — changing to "branch off `dev`" |
| IV. Migrations as Code          | PASS             | No schema changes                                                   |
| V. Interview-Ready Architecture | PASS             | Will document rationale for two-branch workflow                     |

**Amendment required**: Principle III and the CI Pipeline section need a MINOR version bump (1.1.0 → 1.2.0) to reflect:

- Feature branches off `dev` instead of `main`
- `dev` → `main` promotion flow
- E2E tests added to CI pipeline

### Post-design re-check

Same as above. No new violations introduced during design. Constitution amendment is part of the implementation tasks.

## Project Structure

### Documentation (this feature)

```text
specs/028-safe-dev-workflow/
├── plan.md              # This file
├── research.md          # Phase 0 output (completed)
├── data-model.md        # Phase 1 output (completed — no schema changes)
├── quickstart.md        # Phase 1 output (completed)
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (files to modify/create)

```text
# Modified files
.github/workflows/ci.yml          # Add E2E step, update trigger branches
playwright.config.ts               # Add screenshot-on-failure config
CLAUDE.md                          # Replace vague testing rules with specific ones
.specify/memory/constitution.md    # Amend Principle III + CI Pipeline section

# New files
e2e/TEST_REGISTRY.md               # Test registry listing all features + required E2E scenarios
e2e/helpers/auth.ts                # Shared login helper for E2E tests (replaces duplicated login code)
```

**Structure Decision**: This feature modifies existing project infrastructure files. No new directories or architectural changes. The `e2e/helpers/` directory is the only new directory — it holds shared Playwright utilities to avoid duplicating login code across every test file.

## Implementation Steps

### Step 1: Create `dev` branch and update CI triggers

**Files**: `.github/workflows/ci.yml`
**What**: Create `dev` branch from current `main`. Update CI workflow to trigger on push/PR to both `main` and `dev`.

**Changes to `ci.yml`**:

- `on.push.branches`: add `dev`
- `on.pull_request.branches`: add `dev`

**Verification**: Push a test commit to `dev` and confirm CI runs.

### Step 2: Add Playwright E2E to CI pipeline

**Files**: `.github/workflows/ci.yml`, `playwright.config.ts`
**What**: Add E2E test step to CI after build. Install Playwright browsers. Provide test credentials as env vars. Upload artifacts on failure.

**Changes to `ci.yml`** (add after existing Build step):

1. Install Playwright browsers: `pnpm exec playwright install --with-deps chromium`
2. Run E2E tests with env vars:
   - `TEST_USER_EMAIL=test@typenote.dev`
   - `TEST_USER_PASSWORD=Test1234`
   - `NEXT_PUBLIC_SUPABASE_URL` (from Supabase status, already extracted)
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` (from Supabase status, already extracted)
3. Upload `playwright-report/` as artifact on failure

**Changes to `playwright.config.ts`**:

- Add `screenshot: 'only-on-failure'` to `use` block

**Verification**: Push a PR to `dev`, confirm E2E tests run in CI (not skipped), and artifacts are uploaded if any fail.

### Step 3: Create E2E auth helper and fix existing tests

**Files**: `e2e/helpers/auth.ts`, existing E2E test files
**What**: Create a shared login helper. Remove `test.skip` guards from existing tests that skip on missing env vars. All tests should run unconditionally (env vars are now always provided in CI).

**`e2e/helpers/auth.ts`**:

```typescript
export async function login(page: Page) {
  await page.goto('/login');
  await page
    .getByLabel('Email')
    .fill(process.env.TEST_USER_EMAIL ?? 'test@typenote.dev');
  await page
    .getByLabel('Password')
    .fill(process.env.TEST_USER_PASSWORD ?? 'Test1234');
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL('**/dashboard**');
}
```

**Fix existing tests**:

- `export-pdf-dashboard.spec.ts`: Remove `test.skip` block, import shared `login`
- `realtime-sync.spec.ts`: Remove `test.skip` block, import shared `login`, use hardcoded defaults for `TEST_DOC_URL` from seeded data

**Verification**: Run `pnpm test:e2e` locally with `supabase start`. All tests should execute (zero skipped).

### Step 4: Create test registry

**Files**: `e2e/TEST_REGISTRY.md`
**What**: Create the registry listing all application features and their required E2E test scenarios. Mark existing coverage vs gaps.

**Structure**:

```markdown
# E2E Test Registry

## Feature: Auth (e2e/auth.spec.ts) — NOT YET IMPLEMENTED

- [ ] Sign up with email and password
- [ ] Log in with valid credentials
      ...

## Feature: Editor Toolbar (e2e/editor-toolbar.spec.ts) — IMPLEMENTED

- [x] Bold/italic/underline formatting
      ...
```

Each feature section lists:

- The spec file it maps to
- Whether implemented or not
- Individual test scenarios as checkboxes

**Verification**: Review registry, confirm it lists all features from the spec (auth, documents, canvas, LaTeX, courses, file upload, AI chat, PDF export, real-time sync).

### Step 5: Update CLAUDE.md testing rules

**Files**: `CLAUDE.md`
**What**: Replace the current vague "Testing Best Practices" section with specific, enforceable rules.

**New rules** (replacing existing section):

1. Every feature MUST have E2E Playwright tests that test real user flows (login → navigate → use feature → verify). Tests against `/test/*` mock pages do not count as feature coverage.
2. Before considering any feature complete, check `e2e/TEST_REGISTRY.md` and update it with the new feature's test scenarios.
3. If the user doesn't mention E2E tests, ask: "What E2E test scenarios should we add to the test registry for this feature?"
4. E2E tests MUST use the shared login helper from `e2e/helpers/auth.ts`.
5. E2E tests MUST NOT use `test.skip` based on environment variables. All tests must run unconditionally.
6. After writing code, run `pnpm test && pnpm test:integration && pnpm test:e2e` to verify all test levels pass.

**Also update Git Workflow section**:

- Feature branches off `dev`, not `main`
- PRs go to `dev` first, then `dev` → `main` for production release

**Verification**: Read the updated CLAUDE.md and confirm rules are specific and actionable.

### Step 6: Amend constitution

**Files**: `.specify/memory/constitution.md`
**What**: MINOR amendment (1.1.0 → 1.2.0) to Principle III and CI Pipeline section.

**Principle III changes**:

- "create a feature branch off `main`" → "create a feature branch off `dev`"
- Add: PRs go to `dev` first. `dev` → `main` promotion via PR for production release.
- Add: `main` and `dev` are both protected branches.

**CI Pipeline changes**:

- Add step 7: E2E browser tests (`pnpm test:e2e`) — Playwright against local Next.js + Supabase
- Add: Upload playwright-report artifacts on failure

**Verification**: Read amended constitution, confirm consistency with CLAUDE.md and CI workflow.

### Step 7: Set up GitHub branch protection for `dev`

**What**: Configure branch protection rules for `dev` on GitHub (via `gh` CLI or manually).

**Rules** (same as `main`):

- Require status checks to pass before merging
- Required checks: the CI workflow
- No direct pushes

**Verification**: Try pushing directly to `dev` — should be rejected. Open a PR, confirm CI runs.
