# Implementation Plan: Auth & Account Management

**Branch**: `010-auth-account-mgmt` | **Date**: 2026-03-17 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/010-auth-account-mgmt/spec.md`

## Summary

Harden the existing auth system by adding a password-reset flow (forgot password → email → reset page) and sanitizing all auth error messages to prevent email enumeration. No new database tables or migrations — the feature uses Supabase Auth's built-in recovery flow and the existing `profiles` table.

## Technical Context

**Language/Version**: TypeScript 5 / Node.js 22+
**Primary Dependencies**: Next.js 16 (App Router), @supabase/ssr, shadcn/ui (Card, Button, Input, Label)
**Storage**: PostgreSQL via Supabase — existing tables only, no migrations
**Testing**: Vitest (unit, jsdom), Playwright (e2e — deferred for email flows)
**Target Platform**: Web (desktop + mobile browsers)
**Project Type**: Web application (Next.js App Router)
**Performance Goals**: Auth pages load under 1s, form submissions respond under 2s
**Constraints**: No email enumeration in any error message, Supabase rate limiting as backstop
**Scale/Scope**: Single-user auth flows, ~4 pages affected

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                       | Status | Notes                                                                                                                                  |
| ------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| I. Incremental Development      | PASS   | Auth is foundational infrastructure — no AI or advanced features involved. Feature adds to existing working auth.                      |
| II. Test-Driven Quality         | PASS   | Plan includes unit tests for all new pages and updated tests for modified pages. Integration tests for callback route.                 |
| III. Protected Main Branch      | PASS   | Work on `010-auth-account-mgmt` branch. PR required for merge.                                                                         |
| IV. Migrations as Code          | PASS   | No migrations needed — feature uses existing schema.                                                                                   |
| V. Interview-Ready Architecture | PASS   | Error sanitization (OWASP email enumeration), Supabase PKCE flow, and middleware route protection are all interview-relevant patterns. |

**Post-Phase 1 Re-check**: PASS — no new data model or migrations introduced. All design decisions documented in research.md.

## Project Structure

### Documentation (this feature)

```text
specs/010-auth-account-mgmt/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0: research decisions
├── data-model.md        # Phase 1: entity documentation (no changes needed)
├── quickstart.md        # Phase 1: dev setup and testing guide
├── contracts/
│   └── routes.md        # Phase 1: route contracts and access matrix
└── checklists/
    └── requirements.md  # Spec quality checklist
```

### Source Code (repository root)

```text
src/
├── app/
│   ├── (auth)/
│   │   ├── login/
│   │   │   ├── page.tsx          # MODIFY: add forgot-password link + sanitize errors
│   │   │   └── page.test.tsx     # MODIFY: add tests for new link + error sanitization
│   │   ├── signup/
│   │   │   ├── page.tsx          # MODIFY: sanitize error messages
│   │   │   └── page.test.tsx     # MODIFY: add error sanitization tests
│   │   ├── forgot-password/
│   │   │   ├── page.tsx          # NEW: forgot password form
│   │   │   └── page.test.tsx     # NEW: tests
│   │   └── reset-password/
│   │       ├── page.tsx          # NEW: reset password form
│   │       └── page.test.tsx     # NEW: tests
│   └── auth/
│       └── callback/
│           ├── route.ts          # MODIFY: handle recovery redirect via `next` param
│           └── route.test.ts     # NEW: callback unit tests
├── lib/
│   ├── auth-errors.ts            # NEW: error message sanitization utility
│   ├── auth-errors.test.ts       # NEW: tests for error mapping
│   └── supabase/
│       └── middleware.ts          # MODIFY: whitelist /forgot-password
└── test/
    └── (existing setup files)
```

**Structure Decision**: Follows the existing Next.js App Router convention — new pages under `(auth)` route group, shared utilities in `lib/`. No new directories outside established patterns.

## Implementation Phases

### Phase 1: Error Sanitization Utility + Tests

**Goal**: Create the shared error-mapping module that all auth pages will use.

**Files**:

- `src/lib/auth-errors.ts` — `sanitizeAuthError(error: AuthError): string` function
- `src/lib/auth-errors.test.ts` — unit tests covering all error mappings

**Why first**: This is a pure function with no dependencies. Having it ready before touching pages means all page changes can use it immediately. Also establishes the TDD pattern (test first, implement, verify).

**Interview topic**: OWASP email enumeration prevention — why auth error messages should be generic.

### Phase 2: Forgot Password Page + Tests

**Goal**: New page at `/forgot-password` with email submission form.

**Files**:

- `src/app/(auth)/forgot-password/page.tsx` — form component
- `src/app/(auth)/forgot-password/page.test.tsx` — tests
- `src/lib/supabase/middleware.ts` — add `/forgot-password` to public routes

**Behavior**:

- Email input + submit button
- Calls `supabase.auth.resetPasswordForEmail(email, { redirectTo: origin + '/auth/callback?next=/reset-password' })`
- Shows same "Check your email" message regardless of whether email exists
- Loading state during submission
- Link back to login

### Phase 3: Auth Callback Enhancement + Tests

**Goal**: Update callback route to support recovery redirect.

**Files**:

- `src/app/auth/callback/route.ts` — add `next` query param handling
- `src/app/auth/callback/route.test.ts` — tests for OAuth and recovery paths

**Behavior**:

- Read `next` query parameter from URL
- After successful code exchange, redirect to `next` param value (default: `/dashboard`)
- Validate `next` param is a relative path (prevent open redirect)

**Interview topic**: Open redirect prevention — why you validate redirect targets.

### Phase 4: Reset Password Page + Tests

**Goal**: New page at `/reset-password` where user sets new password after clicking email link.

**Files**:

- `src/app/(auth)/reset-password/page.tsx` — form component
- `src/app/(auth)/reset-password/page.test.tsx` — tests

**Behavior**:

- New password + confirm password inputs
- Client-side validation: min 6 chars, passwords must match
- Calls `supabase.auth.updateUser({ password })`
- On success: redirect to `/login?message=password-reset-success`
- On error: show sanitized error message + link to request new reset
- Uses `sanitizeAuthError()` from Phase 1

### Phase 5: Harden Login Page + Tests

**Goal**: Add "Forgot password?" link and sanitize error messages.

**Files**:

- `src/app/(auth)/login/page.tsx` — add link + error sanitization
- `src/app/(auth)/login/page.test.tsx` — update tests

**Changes**:

- Add "Forgot password?" link below password field → navigates to `/forgot-password`
- Replace `setError(error.message)` with `setError(sanitizeAuthError(error))`
- Show success banner when `?message=password-reset-success` is in URL
- Test: verify link renders, verify error messages are sanitized

### Phase 6: Harden Signup Page + Tests

**Goal**: Sanitize signup error messages to prevent email enumeration.

**Files**:

- `src/app/(auth)/signup/page.tsx` — error sanitization
- `src/app/(auth)/signup/page.test.tsx` — update tests

**Changes**:

- Replace `setError(error.message)` with `setError(sanitizeAuthError(error))`
- Verify inline validation works for all required fields
- Test: verify "User already registered" is never exposed to UI

### Phase 7: Integration Testing + Final Verification

**Goal**: Ensure all flows work end-to-end with local Supabase.

**Actions**:

- Run full test suite: `pnpm test`
- Run integration tests: `pnpm test:integration`
- Run linting: `pnpm lint`
- Manual smoke test using Supabase Inbucket (local email capture at `localhost:54324`)
- Verify all CI checks pass

## Complexity Tracking

No constitution violations — no justification needed.
