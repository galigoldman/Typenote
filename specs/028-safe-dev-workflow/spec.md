# Feature Specification: Safe Development Workflow

**Feature Branch**: `028-safe-dev-workflow`
**Created**: 2026-03-26
**Status**: Draft
**Input**: User description: "Set up safe development workflow with dev branch, CI E2E testing, and test registry"

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Developer works on a feature without risking production (Priority: P1)

A developer creates a feature branch off `dev`, builds a feature, and opens a PR into `dev`. CI automatically runs all tests (lint, format, unit, integration, and E2E browser tests). The PR cannot be merged unless all checks pass. Production (`main`) is never touched during this process.

**Why this priority**: This is the core safety guarantee — no untested code reaches users. Without this, everything else is pointless.

**Independent Test**: Can be verified by creating a test branch, opening a PR to `dev`, and confirming CI runs all test levels including Playwright E2E tests. A deliberately broken change should be blocked from merging.

**Acceptance Scenarios**:

1. **Given** a developer has a feature branch, **When** they open a PR to `dev`, **Then** CI runs lint, format check, unit tests, integration tests, E2E browser tests, and build — all must pass before merge is allowed.
2. **Given** a PR to `dev` has a failing E2E test, **When** the developer views the PR, **Then** the merge button is blocked and the failing test is clearly identified in the CI output.
3. **Given** a developer tries to push directly to `main`, **Then** the push is rejected by branch protection rules.

---

### User Story 2 - Promoting tested code from dev to production (Priority: P1)

When `dev` has accumulated tested features ready for release, the developer opens a PR from `dev` to `main`. CI runs the full test suite again on the combined code. Only after all tests pass can the PR be merged, triggering Vercel auto-deployment to production.

**Why this priority**: This is the second gate — it catches bugs that appear when multiple features interact, and ensures nothing reaches production without passing all tests twice.

**Independent Test**: Can be verified by merging two feature branches into `dev` (each passing individually), then opening a PR to `main` and confirming CI runs again on the combined code.

**Acceptance Scenarios**:

1. **Given** `dev` has new features merged, **When** a PR is opened from `dev` to `main`, **Then** CI runs the complete test suite (lint, format, unit, integration, E2E, build) on the combined code.
2. **Given** all CI checks pass on a `dev` → `main` PR, **When** the PR is merged, **Then** Vercel automatically deploys the new code to production.
3. **Given** a CI check fails on a `dev` → `main` PR, **When** the developer views the PR, **Then** the merge is blocked until the issue is fixed.

---

### User Story 3 - E2E browser tests run reliably in CI (Priority: P1)

Playwright E2E tests run in CI against a local Next.js server with a local Supabase database seeded with test data. Tests do not skip due to missing environment variables. Tests cover real user flows: logging in, creating documents, using features, and verifying results in the browser.

**Why this priority**: The existing E2E tests skip in CI because they require manual environment variables. This defeats the purpose of having E2E tests. Fixing this is essential for the entire workflow to function.

**Independent Test**: Can be verified by running the CI pipeline and confirming all E2E tests execute (none skipped), use the local Supabase instance, and produce clear pass/fail results.

**Acceptance Scenarios**:

1. **Given** the CI pipeline runs, **When** it reaches the E2E test step, **Then** Playwright starts a local Next.js dev server and runs all E2E tests against it using the local Supabase database.
2. **Given** a seeded local Supabase database, **When** E2E tests run, **Then** tests can log in with test credentials, create and interact with documents, and verify outcomes — without any manual environment variable setup.
3. **Given** an E2E test fails, **When** the developer views CI output, **Then** the failure includes a screenshot of the browser state at the point of failure and a clear error message.

---

### User Story 4 - Test registry tracks what must be tested (Priority: P2)

A test registry file lists every feature in the application and the specific browser test scenarios that must exist for it. When a new feature is built, the developer (or Claude) adds the feature and its test scenarios to the registry, then writes the corresponding Playwright tests. Claude is instructed via CLAUDE.md to always check and enforce this registry.

**Why this priority**: Without a registry, there is no way to know what is tested and what is not. Features get shipped without E2E coverage and bugs slip through. The registry makes gaps visible.

**Independent Test**: Can be verified by checking that the registry file exists, lists all current features with their test scenarios, and that corresponding Playwright test files exist for each entry.

**Acceptance Scenarios**:

1. **Given** a developer asks Claude to build a new feature, **When** Claude completes the feature, **Then** Claude adds the feature to the test registry with specific test scenarios and writes the corresponding Playwright tests before considering the work done.
2. **Given** the test registry lists a feature, **When** a developer looks at the E2E test files, **Then** every scenario in the registry has a corresponding test case in a Playwright spec file.
3. **Given** a developer modifies an existing feature, **When** the modification changes user-facing behavior, **Then** the registry and corresponding tests are updated to reflect the new behavior.

---

### User Story 5 - CLAUDE.md enforces testing discipline (Priority: P2)

CLAUDE.md contains specific, enforceable rules about testing — not vague guidance. Rules specify: every feature needs E2E tests, the test registry must be updated, E2E tests must test real user flows (not mock pages), and Claude must ask about E2E test scenarios if the user doesn't mention them.

**Why this priority**: The current CLAUDE.md testing rules are too vague ("include tests that verify it works correctly") and have not been enforced. Specific rules prevent Claude from skipping E2E tests or writing superficial tests that pass but don't verify real functionality.

**Independent Test**: Can be verified by reading CLAUDE.md and confirming the testing rules are specific and actionable, then starting a new Claude conversation and asking it to build a feature — Claude should reference the test registry and propose E2E test scenarios.

**Acceptance Scenarios**:

1. **Given** a new Claude conversation, **When** the user asks to build a feature, **Then** Claude checks the test registry and proposes specific E2E test scenarios for the feature before considering the work complete.
2. **Given** CLAUDE.md testing rules, **When** Claude writes tests for a feature, **Then** the E2E tests log in as a real user, navigate the real app, perform the feature's actions, and verify results — not tests against mock/test-only pages.
3. **Given** a user doesn't mention tests, **When** Claude finishes implementing a feature, **Then** Claude asks: "What E2E test scenarios should we add to the test registry for this feature?"

---

### Edge Cases

- What happens when E2E tests are flaky (pass sometimes, fail sometimes)? Tests should be retried up to 2 times in CI before marking as failed. Persistent flaky tests must be investigated and fixed, not ignored.
- What happens when a new database migration is needed for E2E tests? The local Supabase in CI applies all migrations automatically, so new migrations are picked up without manual intervention.
- What happens when `dev` falls behind `main`? (e.g., a hotfix goes directly to `main`) The developer must merge `main` back into `dev` to keep them in sync.
- What happens when multiple developers work on `dev` simultaneously? Each developer works on their own feature branch and merges to `dev` via PR. Merge conflicts are resolved in the feature branch before merging.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The repository MUST have a `dev` branch that serves as the integration branch for all feature work.
- **FR-002**: Branch protection MUST be enabled on both `main` and `dev`, requiring all CI checks to pass before merging.
- **FR-003**: The CI pipeline MUST run lint, format check, unit tests, integration tests, E2E browser tests, and build on every PR to `dev` and `main`.
- **FR-004**: E2E tests MUST run in CI using Playwright against a local Next.js server connected to a local Supabase database with seeded test data.
- **FR-005**: E2E tests MUST NOT skip due to missing environment variables. All required test credentials and configuration MUST be provided automatically in CI.
- **FR-006**: E2E test failures MUST produce screenshots of the browser state at the point of failure.
- **FR-007**: A test registry file MUST exist that lists every application feature and its required E2E test scenarios.
- **FR-008**: CLAUDE.md MUST contain specific, enforceable rules requiring E2E tests for every feature, test registry updates, and real user flow testing (not mock pages).
- **FR-009**: The CI pipeline MUST retry failed E2E tests up to 2 times before marking them as failed (to handle transient failures during initial setup).
- **FR-010**: Seeded test data MUST include at least: a test user account, a test course, and a test document — sufficient for E2E tests to exercise all major features.
- **FR-011**: Feature branches MUST be created off `dev`, not `main`. PRs go to `dev` first, then `dev` goes to `main`.

### Key Entities

- **Test Registry**: A file listing all application features and their required E2E test scenarios. Lives at `e2e/TEST_REGISTRY.md`.
- **Test Seed Data**: Pre-defined data (users, courses, documents) loaded into local Supabase before E2E tests run. Lives in `supabase/seed.sql`.
- **CI Workflow**: GitHub Actions configuration that orchestrates the full test pipeline including E2E. Lives at `.github/workflows/ci.yml`.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Every PR to `dev` and `main` runs the complete test suite including E2E browser tests, with zero tests skipped.
- **SC-002**: No code reaches `main` (and therefore production) without passing lint, format, unit, integration, E2E, and build checks.
- **SC-003**: E2E test failures produce browser screenshots that clearly show what went wrong.
- **SC-004**: The test registry covers all existing application features (auth, documents, canvas editor, LaTeX, courses, file upload, AI chat, PDF export, real-time sync).
- **SC-005**: A new Claude conversation can read CLAUDE.md and the test registry and know exactly what E2E tests exist and what to add for a new feature — without any prior context.
- **SC-006**: The workflow from feature branch to production involves exactly two merge gates: feature → dev (all tests pass) and dev → main (all tests pass again).
