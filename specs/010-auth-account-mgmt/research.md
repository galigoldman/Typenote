# Research: Auth & Account Management

**Feature Branch**: `010-auth-account-mgmt`
**Date**: 2026-03-17

## R-001: Supabase Password Reset Flow

**Decision**: Use Supabase's built-in `resetPasswordForEmail()` + `updateUser()` flow.

**Rationale**: Supabase Auth handles the entire token lifecycle — generation, email delivery, expiry, and single-use enforcement. The client SDK provides `resetPasswordForEmail()` to trigger the email and the auth callback delivers a `recovery` event type. After the user lands on the reset page via the emailed link, `updateUser({ password })` completes the reset. This avoids building custom token logic and inherits Supabase's rate limiting.

**Flow**:
1. User submits email on `/forgot-password` page
2. Client calls `supabase.auth.resetPasswordForEmail(email, { redirectTo })`
3. Supabase sends email with a link containing a recovery token
4. Link redirects to `/auth/callback` with `type=recovery` → exchanges code for session
5. Callback redirects to `/reset-password` page
6. User enters new password → client calls `supabase.auth.updateUser({ password })`
7. On success → redirect to `/login` with success message

**Alternatives considered**:
- Custom token table + email sending: Rejected — duplicates what Supabase provides, adds maintenance burden and potential security gaps.
- Magic link auth as reset: Rejected — different UX expectation (users expect to set a specific password).

## R-002: Auth Callback Route Enhancement

**Decision**: Extend the existing `/auth/callback/route.ts` to handle `type=recovery` in addition to OAuth code exchange.

**Rationale**: Supabase password reset links use the same PKCE code exchange flow as OAuth. The callback route already handles `code` parameter exchange. The `next` query parameter (set via `redirectTo` in the reset request) tells us where to redirect after session establishment. For recovery flows, this will be `/reset-password`.

**Alternatives considered**:
- Separate `/auth/reset-callback` route: Rejected — unnecessary duplication. The existing callback can handle both OAuth and recovery via the `next` query parameter.

## R-003: Error Message Sanitization

**Decision**: Map Supabase error messages to user-friendly equivalents. Never expose raw Supabase errors to users.

**Rationale**: Supabase returns technical error messages like `"Invalid login credentials"` or `"User already registered"`. Some of these leak information (e.g., confirming an email exists). All error messages must be mapped to safe, user-friendly equivalents that don't reveal system internals.

**Error mapping strategy**:
- Login failures → generic "Invalid email or password"
- Signup with existing email → generic "Unable to create account. Try logging in or resetting your password."
- Rate limiting → "Too many attempts. Please try again later."
- Network/server errors → "Something went wrong. Please try again."
- Reset for unregistered email → same success message as registered (no enumeration)

**Alternatives considered**:
- Pass-through Supabase errors: Rejected — security risk (email enumeration, implementation leakage).
- Error codes only: Rejected — poor UX for a consumer-facing app.

## R-004: Form Validation Strategy

**Decision**: Client-side validation with HTML5 attributes + React state validation. No separate validation library.

**Rationale**: The existing signup/login forms already use HTML5 `required` and `minLength` attributes. Adding a library like Zod or react-hook-form would be over-engineering for 3-4 simple forms with 2-3 fields each. Client-side validation handles the happy path; server-side (Supabase) catches anything that slips through.

**Validation rules**:
- Email: `type="email"` + `required` (browser-native validation)
- Password: `minLength={6}` + `required`
- Display name (signup): `required`
- New password confirmation (reset page): custom match check in React state

**Alternatives considered**:
- Zod + react-hook-form: Rejected — disproportionate complexity for simple forms. Would add if forms grow more complex later.
- Server-only validation: Rejected — poor UX (round-trip delay for obvious client-side errors).

## R-005: Middleware Route Protection for New Pages

**Decision**: Add `/forgot-password` and `/reset-password` to the auth page whitelist in middleware.

**Rationale**: The existing middleware checks `isAuthPage` to allow unauthenticated access to `/login`, `/signup`, and `/auth/*`. The new forgot-password page must be accessible without authentication. The reset-password page is accessed after Supabase creates a temporary session via the recovery token, so it needs authenticated access (the user has a valid session after clicking the recovery link).

**Route access rules**:
- `/forgot-password` → public (unauthenticated users need this)
- `/reset-password` → authenticated only (user has temporary recovery session)
- Both should redirect authenticated non-recovery users away (e.g., if a logged-in user visits `/forgot-password`, redirect to dashboard)

## R-006: Testing Strategy for Auth Flows

**Decision**: Unit tests (Vitest + jsdom) for form components and error handling. Integration tests for auth callback logic. No e2e for email-dependent flows (Supabase email delivery is external).

**Rationale**:
- Unit tests: Verify form rendering, validation behavior, error display, loading states. Mock `supabase.auth` methods. Existing tests for login/signup follow this pattern.
- Integration tests: Verify the callback route handles both OAuth and recovery codes correctly.
- E2e (Playwright): Would test the full browser flow but email delivery is external to our control. Defer to manual testing for email flows.

**Test files**:
- `src/app/(auth)/forgot-password/page.test.tsx` — forgot-password form
- `src/app/(auth)/reset-password/page.test.tsx` — reset-password form
- `src/app/(auth)/login/page.test.tsx` — update existing with forgot-password link test
- `src/app/(auth)/signup/page.test.tsx` — update existing with error message tests
- `src/app/auth/callback/route.test.ts` — callback handles recovery type
