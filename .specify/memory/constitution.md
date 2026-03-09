<!--
Sync Impact Report
==================
- Version change: 1.0.0 -> 1.1.0
- Bump rationale: MINOR — expanded Principle II with integration
  testing requirements and updated CI Pipeline section
- Modified principles:
  - II. Test-Driven Quality — added integration test requirements
    (Supabase in CI, test levels, file conventions)
- Modified sections:
  - CI Pipeline — updated to reflect two-phase test execution
    (unit tests + integration tests with Supabase)
- Templates requiring updates:
  - .specify/templates/plan-template.md ✅ (no change needed)
  - .specify/templates/spec-template.md ✅ (no change needed)
  - .specify/templates/tasks-template.md ✅ (no change needed)
- Follow-up TODOs: none
-->

# Typenote Constitution

## Core Principles

### I. Incremental Development

Every feature MUST be built in gradual phases. Begin with database
schema and core CRUD operations before introducing any advanced or
AI-powered functionality.

- New features MUST NOT skip foundational infrastructure.
- Each phase MUST produce a working, testable increment.
- Advanced features (AI, real-time collaboration, etc.) MUST NOT
  be started until the underlying data model and basic operations
  are solid and tested.

**Rationale**: Building bottom-up ensures a stable foundation and
prevents cascading failures when complexity increases. This mirrors
how production systems are built at scale.

### II. Test-Driven Quality

Every new feature or change MUST include tests that verify it works.
Tests MUST pass locally before a step is considered "done."

- Test at multiple levels: unit tests (Vitest) for individual
  functions, integration tests for database operations, and
  end-to-end tests (Playwright) for critical user flows.
- When fixing a bug, MUST write a failing test that reproduces
  the bug first, then fix the code, then confirm the test passes
  (regression testing).
- After writing code, MUST run the full test suite (`pnpm test`)
  to confirm nothing is broken.
- **Database integration tests** (`pnpm test:integration`) run
  against a real local Supabase instance. CI starts Supabase
  automatically and runs these after unit tests.
- Any change to migrations, seed data, RLS policies, or database
  queries MUST be covered by an integration test to prevent
  regressions.
- File naming convention: `*.test.ts` for unit tests,
  `*.integration.test.ts` for database integration tests.
- Integration tests use `src/test/supabase-client.ts` to create
  authenticated and admin clients — never import the Next.js
  server client (`@/lib/supabase/server`) in integration tests.

**Rationale**: Multi-level testing catches bugs at different
granularities. Unit tests verify logic in isolation; integration
tests verify that migrations, RLS policies, and queries work
against a real Postgres. Running both in CI ensures the database
layer is never silently broken by a schema change.

### III. Protected Main Branch

Code reaches `main` ONLY through approved, CI-passing Pull Requests.
Never commit directly to `main`.

- MUST create a feature branch off `main` before starting work
  (e.g., `feat/setup-database`, `003-course-materials`).
- MUST commit frequently with clear messages describing what
  changed and why.
- MUST push and open a PR when a step is complete and tests
  pass locally.
- PR MUST pass all CI checks (lint, test) before merge.
- Direct push or force push to `main` is forbidden.

**Rationale**: Branch protection enforces code review and automated
quality gates, ensuring `main` is always deployable. This is standard
practice in professional teams and a common interview topic.

### IV. Migrations as Code (Supabase)

All database schema changes MUST be captured as SQL migration files
in `supabase/migrations/` and committed to git. The local Supabase
instance is the development database.

- Schema changes MUST be created via `supabase migration new <name>`
  which generates a timestamped SQL file.
- After writing a migration, MUST run `supabase db reset` to verify
  the full migration chain replays cleanly from scratch.
- `supabase/seed.sql` MUST be updated when new tables or required
  reference data are added, so that `db reset` produces a usable
  local environment.
- `supabase/config.toml` MUST be committed so all developers share
  identical local Supabase configuration.
- MUST NOT make schema changes only through the Studio UI without
  capturing them in a migration file. Use `supabase db diff` to
  extract ad-hoc changes if needed.
- Production schema updates MUST go through `supabase db push`
  after migrations pass review in a PR.

**Key files tracked in git**:

- `supabase/config.toml` — local Supabase config
- `supabase/migrations/*.sql` — ordered migration files
- `supabase/seed.sql` — development seed data

**Key commands**:
| Command | Purpose |
|---|---|
| `supabase db reset` | Drop local DB, replay all migrations, run seed |
| `supabase migration new <name>` | Create new empty migration file |
| `supabase db diff --linked` | Generate diff from Studio UI changes |
| `supabase db push` | Push migrations to remote/production |

**Rationale**: Migrations as code make the database schema
reproducible, reviewable in PRs, and auditable in git history.
Any developer (or CI) can recreate the exact database state by
running `supabase db reset`. This is the same principle behind
tools like Flyway, Alembic, and Rails migrations.

### V. Interview-Ready Architecture

Every architectural decision, technology choice, or significant
piece of code MUST be accompanied by an explanation of the reasoning
and trade-offs. Use professional industry terminology.

- MUST explain the "why" behind decisions, not just the "how."
- MUST proactively ask clarifying questions when requirements are
  ambiguous or multiple valid approaches exist.
- MUST highlight concepts commonly asked about in R&D interviews
  (e.g., normalization vs. denormalization, component state
  management, performance optimization, migrations as code).

**Rationale**: The primary goal of this project is not just working
software, but deep understanding of the architecture so the
developer can confidently discuss the system design in job
interviews.

## Technology Stack

- **Runtime**: TypeScript 5 / Node.js 18+
- **Framework**: Next.js 16 (App Router)
- **Database**: PostgreSQL via Supabase (local dev + hosted prod)
- **Auth**: Supabase Auth (SSR via `@supabase/ssr`)
- **Storage**: Supabase Storage (PDF uploads)
- **Editor**: TipTap 3 (rich text), KaTeX (math rendering)
- **UI**: shadcn/ui, Radix, Tailwind CSS 4
- **Testing**: Vitest (unit/integration), Playwright (e2e)
- **CI**: GitHub Actions (lint + test on every push/PR)
- **Package Manager**: pnpm
- **Formatting/Linting**: Prettier + ESLint

## Development Workflow

### Local Development Setup

1. Clone the repository
2. `pnpm install` — install dependencies
3. `supabase start` — start local Supabase (Postgres, Auth, Storage)
4. Copy `.env.local.example` to `.env.local` with local Supabase keys
5. `pnpm dev` — start Next.js dev server

### Schema Change Workflow

1. `supabase migration new <descriptive_name>` — create migration file
2. Write SQL in the generated file
3. `supabase db reset` — replay all migrations to verify correctness
4. Update `supabase/seed.sql` if new tables need test data
5. Commit migration + seed changes in the feature branch
6. Open PR — migration SQL is reviewable in the diff

### CI Pipeline

- Triggered on every push and PR to `main`
- Steps:
  1. Install dependencies (`pnpm install --frozen-lockfile`)
  2. Lint (`pnpm lint`) + format check (`pnpm format:check`)
  3. Unit tests (`pnpm test`) — jsdom environment, no DB needed
  4. Start local Supabase (`supabase start`)
  5. Integration tests (`pnpm test:integration`) — real Postgres,
     validates migrations + seed + RLS + queries
  6. Build (`pnpm build`)
- PRs MUST NOT be merged until CI passes (enforced via GitHub
  branch protection)

## Governance

This constitution supersedes all ad-hoc practices. All PRs and
code reviews MUST verify compliance with these principles.

- **Amendments** require: (1) documentation of the change,
  (2) rationale for why it is needed, (3) a version bump following
  SemVer (MAJOR for principle removals/redefinitions, MINOR for
  new principles/sections, PATCH for clarifications).
- **Complexity** MUST be justified. If a simpler alternative
  exists, use it unless there is a documented reason not to.
- For runtime development guidance, refer to `CLAUDE.md` at the
  repository root.

**Version**: 1.1.0 | **Ratified**: 2026-03-09 | **Last Amended**: 2026-03-09
