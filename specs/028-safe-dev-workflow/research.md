# Research: Safe Development Workflow

## Decision 1: Test user for E2E tests

**Decision**: Use the existing seeded test user `test@typenote.dev` / `Test1234` (ID: `ac3be77d-4566-406c-9ac0-7c410634ad41`)

**Rationale**: The seed.sql already creates this user with confirmed email, free tier subscription, folders, documents, courses, AI conversations, and personal files. No additional setup needed. The seed is idempotent (uses `ON CONFLICT ... DO NOTHING`).

**Alternatives considered**:
- Create users programmatically in test fixtures via Supabase admin API — adds complexity, slower test startup, not needed since seed data is comprehensive
- Create a separate E2E seed file — unnecessary duplication, the existing seed already has everything needed

## Decision 2: Where Playwright E2E step goes in CI

**Decision**: After the Build step (last current step). Supabase is already running from the integration test steps.

**Rationale**: E2E tests need both a built Next.js app and a running Supabase. The current CI already starts Supabase for integration tests. Playwright's `webServer` config auto-starts `pnpm dev` on `localhost:3000`. Placing E2E after build ensures everything is ready.

**Alternatives considered**:
- Run E2E before build — app wouldn't be verified to compile, and we need Supabase already running
- Run E2E in a separate job — adds complexity, would need to start Supabase again in a new runner

## Decision 3: How to provide test credentials in CI

**Decision**: Pass `TEST_USER_EMAIL` and `TEST_USER_PASSWORD` as environment variables in the CI workflow E2E step. The existing E2E tests already read these variables — they just weren't being set in CI.

**Rationale**: Simplest approach. No code changes needed to existing tests that already use `process.env.TEST_USER_EMAIL`. New tests will follow the same pattern. The credentials are not secrets (they're for local Supabase only).

**Alternatives considered**:
- Store credentials in GitHub secrets — overkill for local-only test credentials
- Hardcode in Playwright config — less flexible, harder to change

## Decision 4: Screenshot and artifact configuration

**Decision**: Add `screenshot: 'only-on-failure'` to Playwright config. Upload `playwright-report/` and `test-results/` as GitHub Actions artifacts on failure.

**Rationale**: Screenshots on failure fulfill FR-006 (browser screenshots on failure). Artifacts allow developers to download the HTML report and inspect exactly what went wrong. Only uploading on failure keeps CI fast and storage low.

**Alternatives considered**:
- Always capture screenshots — wastes storage, makes CI slower
- Video recording on failure — nice but significantly increases CI time and artifact size. Can add later.

## Decision 5: CI trigger branches

**Decision**: Update CI to trigger on push/PR to both `main` and `dev`.

**Rationale**: Currently CI only triggers on `main`. The whole point of the `dev` branch is that it runs the same CI checks. Both branches need identical protection.

**Alternatives considered**:
- Separate workflow files for `dev` and `main` — unnecessary duplication, same pipeline for both

## Decision 6: Constitution amendment needed

**Decision**: Amend Principle III ("Protected Main Branch") and the CI Pipeline section to reflect the new `dev` → `main` workflow and E2E tests in CI.

**Rationale**: The constitution currently says "create a feature branch off `main`" — this changes to "off `dev`". The CI Pipeline section doesn't include E2E — it needs to. These are minor amendments (MINOR version bump).

**Alternatives considered**:
- Leave constitution as-is and only update CLAUDE.md — creates contradiction between the two documents, confusing for future Claude sessions
