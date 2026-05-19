# Research: Google Sign-Up as Only Registration Option

**Feature**: 042-google-signup
**Date**: 2026-05-18

## Research Tasks

### 1. Current Google OAuth Implementation

**Decision**: Reuse the existing Google OAuth flow — no changes to the OAuth configuration or callback route.

**Rationale**: The codebase already has a working `handleGoogleSignup()` function in `src/app/(auth)/signup/page.tsx` that calls `supabase.auth.signInWithOAuth({ provider: 'google' })`. The callback route at `src/app/auth/callback/route.ts` correctly exchanges the authorization code for a session and redirects to `/dashboard`. The database trigger `handle_new_user` (in `00001_initial_schema.sql`) already extracts `name` and `avatar_url` from `raw_user_meta_data`, which Google OAuth populates.

**Alternatives considered**:

- Building a custom OAuth flow with Google's API directly — rejected because Supabase Auth already handles this securely and correctly.

### 2. Impact on Login Page

**Decision**: Keep the login page unchanged — it retains both email/password and Google sign-in options.

**Rationale**: Existing beta users signed up with email/password and need to continue logging in that way. Removing email/password from login would lock them out. The Google button on the login page serves existing Google users and any new users who signed up via Google.

**Alternatives considered**:

- Making login Google-only too — rejected because it would break access for existing email/password users (violates FR-004).
- Adding a migration path to link email/password accounts to Google — out of scope for this feature, could be a future enhancement.

### 3. Error Handling for OAuth Failures

**Decision**: Display error messages on the signup page when Google OAuth fails or is cancelled.

**Rationale**: The existing callback route (`/auth/callback/route.ts`) already redirects to `/login?error=auth_failed` on failure. The signup page should handle a similar error query parameter (or the signup page can show errors when the OAuth flow returns the user to the signup page without completing).

**Alternatives considered**:

- Silent failure with no message — rejected because users need feedback.
- Custom error page — rejected as over-engineering for this scope.

## Summary

No unknowns remain. The existing infrastructure handles Google OAuth, profile creation, and session management. The implementation is purely a UI simplification of the signup page.
