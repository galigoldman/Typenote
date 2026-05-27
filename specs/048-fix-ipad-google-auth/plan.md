# Implementation Plan: Fix iPad Google OAuth Sign-In

**Branch**: `048-fix-ipad-google-auth` | **Date**: 2026-05-27 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/048-fix-ipad-google-auth/spec.md`

## Summary

Fix Google OAuth sign-in/sign-up on iPad Safari. The current async `signInWithOAuth` call may not redirect reliably on Safari due to the redirect happening outside the synchronous user-gesture call stack. Additionally, if PKCE cookies are lost during the redirect chain, the callback fails silently. The fix uses `skipBrowserRedirect: true` to get the OAuth URL synchronously, then manually assigns `window.location.href` within the tap handler. The callback route error handling is also improved to prevent silent failures.

## Technical Context

**Language/Version**: TypeScript 5 / Node.js 22+
**Primary Dependencies**: Next.js 16 (App Router), React 19, @supabase/ssr, @supabase/supabase-js
**Storage**: N/A — no schema changes, client-side only
**Testing**: Vitest (unit), Playwright (E2E)
**Target Platform**: Web — all browsers, with specific focus on iPad Safari (iPadOS 17+)
**Project Type**: Web application (Next.js)
**Performance Goals**: N/A — bug fix
**Constraints**: Must work with Safari's default ITP privacy settings without requiring user configuration changes
**Scale/Scope**: 4 files modified, ~50 lines changed

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                       | Status | Notes                                                                                                                                               |
| ------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| I. Incremental Development      | PASS   | Bug fix on existing auth infrastructure. No new features being added before foundations.                                                            |
| II. Test-Driven Quality         | PASS   | Will write a failing test first (callback error handling), then fix. Unit tests for both auth pages. E2E test for Google OAuth flow where possible. |
| III. Protected Branches         | PASS   | Working on feature branch `048-fix-ipad-google-auth` off `dev`. Will PR to `dev`.                                                                   |
| IV. Migrations as Code          | PASS   | No database changes needed.                                                                                                                         |
| V. Interview-Ready Architecture | PASS   | OAuth PKCE flow, Safari ITP, and cross-browser compatibility are relevant interview topics.                                                         |

**Post-Phase 1 Re-check**: All gates still pass. No new complexity introduced.

## Project Structure

### Documentation (this feature)

```text
specs/048-fix-ipad-google-auth/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Root cause analysis and solutions
├── data-model.md        # Entity documentation (no changes)
├── quickstart.md        # Development setup guide
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Task breakdown (created by /speckit.tasks)
```

### Source Code (repository root)

```text
src/
├── app/
│   ├── (auth)/
│   │   ├── login/
│   │   │   ├── page.tsx          # Google login button — fix OAuth redirect
│   │   │   └── page.test.tsx     # Update test for new redirect pattern
│   │   └── signup/
│   │       ├── page.tsx          # Google signup button — fix OAuth redirect
│   │       └── page.test.tsx     # Update test for new redirect pattern
│   └── auth/
│       └── callback/
│           ├── route.ts          # Improve PKCE error handling
│           └── route.test.ts     # Add test for PKCE failure scenario
└── lib/
    └── supabase/
        └── middleware.ts         # Verify OAuth error handling (read-only)

e2e/
└── google-auth-safari.spec.ts    # E2E tests (limited — can't test real Google OAuth)
```

**Structure Decision**: Existing Next.js App Router structure. All changes are in existing files except one potential new E2E test file.

## Complexity Tracking

No constitution violations. No complexity justifications needed.
