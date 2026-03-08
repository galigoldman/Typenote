<!--
Sync Impact Report
- Version change: 0.0.0 → 1.0.0
- Bump rationale: Initial constitution creation (MAJOR — first adoption)
- Added principles:
  1. Test Coverage First
  2. UX Excellence
  3. Protected Main via CI
  4. Rebase-Only PR Workflow
  5. Fix-Forward CI Discipline
- Removed principles: none
- Templates requiring updates:
  - CLAUDE.md ✅ already aligned (testing, git workflow, CI sections)
  - .github/workflows/ci.yml ✅ already aligned (lint, format, test, build)
  - GitHub branch protection ⚠ requires manual configuration (see follow-up)
- Follow-up TODOs:
  - Configure GitHub branch protection rules via Settings or gh CLI
-->

# Typenote Project Constitution

**Version:** 1.0.0
**Ratification Date:** 2026-03-08
**Last Amended:** 2026-03-08

## Purpose

This constitution defines the non-negotiable engineering principles
that govern all development on Typenote. Every contributor, tool, and
automated agent MUST adhere to these principles. Violations block
merging.

## Principle 1 — Test Coverage First

Every feature, bug fix, and refactor MUST ship with tests that verify
its correctness. Coverage is required at multiple levels:

- **Unit tests** for individual functions, utilities, and modules.
- **Integration tests** for API endpoints, database operations, and
  hook/component interactions.
- **End-to-end tests** for critical user flows (document creation,
  editing, sync, drawing, offline).

A pull request MUST NOT be merged if it reduces overall test coverage
or introduces untested code paths. When fixing a bug, a failing
regression test MUST be written first, then the fix applied.

**Rationale:** High coverage catches regressions early and gives
confidence to refactor. It also ensures the codebase is demonstrably
correct — critical for interview discussions about quality engineering.

## Principle 2 — UX Excellence

The user experience MUST be the primary design driver for every
interface decision. Specific mandates:

- All interactive elements MUST meet platform touch-target guidelines
  (44×44pt minimum on touch devices).
- Loading, empty, and error states MUST be explicitly designed — never
  left as browser defaults or blank screens.
- Interactions MUST provide immediate visual feedback (optimistic UI,
  skeleton loaders, transition animations where appropriate).
- Accessibility MUST be considered: semantic HTML, ARIA labels where
  needed, keyboard navigability, sufficient color contrast.
- Performance-perceived UX matters: first contentful paint under 1.5s
  on 4G, no layout shifts after initial render.

**Rationale:** Typenote targets STEM students who switch between
devices constantly. A polished, responsive UX is a core product
differentiator and a rich topic for system-design interview
discussions.

## Principle 3 — Protected Main via CI

The `main` branch is protected. Code reaches `main` ONLY through pull
requests that pass all CI checks. The CI pipeline MUST:

1. Install dependencies (`pnpm install --frozen-lockfile`).
2. Run linting (`pnpm lint`).
3. Run format checking (`pnpm format:check`).
4. Run the full test suite (`pnpm test`).
5. Run a production build (`pnpm build`).

Direct pushes to `main` are forbidden. Force-pushes to `main` are
forbidden. No exceptions.

**Rationale:** A green `main` branch is the single source of truth.
CI gating prevents broken code from reaching production and ensures
every merged change is lint-clean, formatted, tested, and buildable.

## Principle 4 — Rebase-Only PR Workflow

Pull requests MUST be merged using **rebase merge** only. Squash
merges and merge commits are disabled on the repository.

- Each feature branch MUST be rebased onto the latest `main` before
  merging to maintain a linear commit history.
- Commits MUST be small, focused, and have clear messages describing
  _what_ changed and _why_.
- One feature branch per task/step. Never commit directly to `main`.

**Rationale:** A linear history is easier to bisect, review, and
reason about. Rebase merges preserve individual commit granularity
while keeping `main` clean — a best practice frequently discussed in
engineering interviews.

## Principle 5 — Fix-Forward CI Discipline

When a CI check fails on a pull request, the author MUST:

1. Diagnose the failure from CI logs.
2. Fix the issue on the same branch.
3. Push the fix and wait for CI to pass.
4. Only then proceed with merge.

Skipping CI (`--no-verify`), disabling checks, or merging with
failures is forbidden. If a flaky test is identified, it MUST be
fixed or quarantined with a tracking issue — never ignored.

**Rationale:** CI is only valuable if it is trusted. Allowing
bypasses erodes that trust and eventually leads to a broken `main`.
Fix-forward discipline keeps the feedback loop tight.

## Governance

### Amendment Process

1. Propose changes via a pull request modifying this file.
2. Changes follow the same CI and review process as code.
3. Version increments follow semantic versioning:
   - **MAJOR**: Principle removed, redefined, or governance changed
     incompatibly.
   - **MINOR**: New principle added or existing principle materially
     expanded.
   - **PATCH**: Wording clarification, typo fix, non-semantic
     refinement.

### Compliance Review

At the start of each new feature branch, the developer (or agent)
SHOULD review this constitution to ensure planned work aligns with
all principles. Non-compliance discovered during PR review blocks
merging until resolved.

### Enforcement

- GitHub branch protection rules enforce Principles 3 and 4.
- CI workflow enforces Principle 3 pipeline steps.
- Code review (human or agent) enforces Principles 1, 2, and 5.
