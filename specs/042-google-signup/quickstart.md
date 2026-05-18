# Quickstart: Google Sign-Up as Only Registration Option

**Feature**: 042-google-signup

## Prerequisites

- Node.js 22+
- pnpm installed
- Supabase CLI installed
- Google OAuth configured in Supabase (already done for this project)

## Setup

```bash
# 1. Switch to the feature branch
git checkout 042-google-signup

# 2. Install dependencies
pnpm install

# 3. Start local Supabase
supabase start

# 4. Start dev server
pnpm dev
```

## What to Verify

1. **Signup page** (`/signup`): Should show only a "Sign up with Google" button — no email/password form
2. **Login page** (`/login`): Should still show both email/password form AND Google sign-in button
3. **Existing user login**: Use `test@typenote.dev` / `Test1234` to verify email/password login still works
4. **Auth callback**: `/auth/callback` should still work for OAuth redirects

## Running Tests

```bash
# Unit tests
pnpm test

# Integration tests (requires local Supabase)
pnpm test:integration

# E2E tests (requires local Supabase + dev server)
pnpm test:e2e
```

## Key Files

| File                                    | Change   | Purpose                              |
| --------------------------------------- | -------- | ------------------------------------ |
| `src/app/(auth)/signup/page.tsx`        | MODIFY   | Google-only signup UI                |
| `src/app/(auth)/signup/page.test.tsx`   | MODIFY   | Updated unit tests                   |
| `e2e/google-signup.spec.ts`            | NEW      | E2E test for Google signup flow      |
