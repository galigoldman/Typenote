# Quickstart: Safe Development Workflow

## After implementation, the daily workflow is:

### Starting new work
```bash
git checkout dev
git pull origin dev
git checkout -b feat/my-feature    # branch off dev, not main
```

### During development
```bash
pnpm test                          # run unit tests
pnpm test:integration              # run integration tests (needs local Supabase)
pnpm test:e2e                      # run E2E browser tests locally
```

### Submitting work
```bash
git push -u origin feat/my-feature
# Open PR → dev (NOT main)
# CI runs: lint, format, unit, integration, E2E, build
# Merge when CI passes
```

### Releasing to production
```bash
# Open PR from dev → main
# CI runs all tests again on combined code
# Merge when CI passes → Vercel auto-deploys
```

### If dev falls behind main (e.g., after a hotfix)
```bash
git checkout dev
git merge main
git push origin dev
```

## Running E2E tests locally

```bash
# Start local Supabase (if not already running)
supabase start

# Run all E2E tests (headless)
pnpm test:e2e

# Run E2E tests with browser visible (for debugging)
pnpm test:e2e:ui

# Run a specific test file
pnpm test:e2e -- e2e/auth.spec.ts
```

## Test credentials (local only)
- **Email**: `test@typenote.dev`
- **Password**: `Test1234`
- These are seeded automatically by `supabase/seed.sql`
