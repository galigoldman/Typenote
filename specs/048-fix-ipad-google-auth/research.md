# Research: Fix iPad Google OAuth Sign-In

**Feature**: 048-fix-ipad-google-auth
**Date**: 2026-05-27

## Research Tasks

### 1. Root Cause Analysis: iPad Safari OAuth Failure

**Decision**: The issue has two likely root causes that must both be addressed:

1. **Safari async redirect blocking**: The `handleGoogleSignup` / `handleGoogleLogin` functions are `async`. When `signInWithOAuth` is called, the Supabase JS SDK internally calls `window.location.assign()` after an `await` boundary. iPad Safari's popup/redirect blocker may treat this as "not user-initiated" because the redirect happens outside the synchronous call stack of the tap event. This can cause the redirect to silently fail or behave unpredictably.

2. **PKCE code verifier loss on Safari**: `@supabase/ssr`'s `createBrowserClient` stores PKCE code verifiers in cookies via `document.cookie`. Safari's ITP (Intelligent Tracking Prevention) can interfere with cookie persistence during the OAuth redirect round-trip, especially when the redirect chain crosses domains (app → Google → Supabase GoTrue → app). If the code verifier cookie is lost, `exchangeCodeForSession` in the callback route fails, and the user gets redirected to `/login?error=auth_failed`.

3. **"New user with no data" symptom**: This may indicate the user's existing account was created via email/password, and the Google OAuth creates a SEPARATE Supabase user (different `auth.users` row). Since `enable_manual_linking = false` in `config.toml`, accounts with different providers are not automatically linked. The user lands on the dashboard with an empty workspace because the new Google user has no documents.

**Rationale**: All three factors must be investigated. The middleware already handles `bad_oauth_state` errors (line 43-51 of `middleware.ts`), suggesting OAuth state issues have been encountered before. The `skip_nonce_check = true` setting for Google in `config.toml` also suggests previous Safari/mobile compatibility work.

**Alternatives considered**:

- Switching to implicit flow instead of PKCE — rejected because PKCE is more secure and is the recommended flow for browser clients.
- Using a popup instead of redirect — rejected because Safari blocks popups even more aggressively than redirects.

### 2. Safari-Compatible OAuth Redirect Pattern

**Decision**: Ensure the `signInWithOAuth` redirect happens synchronously within the user gesture's call stack, or use `window.location.href` assignment directly with the OAuth URL.

**Rationale**: Safari's redirect blocker is strict about user-initiated navigation. The fix should either:

- Use `skipBrowserRedirect: true` on `signInWithOAuth` to get the OAuth URL without redirecting, then assign `window.location.href` directly in the synchronous click handler
- Or ensure no `await` happens before the redirect

The `skipBrowserRedirect: true` approach is documented in Supabase's official docs for handling OAuth in environments where automatic redirects are unreliable (React Native, Safari on iOS/iPadOS, etc.).

**Alternatives considered**:

- Wrapping in `setTimeout` to defer redirect — rejected because it makes the timing issue worse.
- Opening in a new tab via `window.open` — rejected because Safari blocks this even more aggressively.

### 3. PKCE Cookie Persistence on Safari

**Decision**: Verify PKCE cookies are set with `SameSite=Lax` (not `Strict` or `None`) and without third-party cookie restrictions that Safari might enforce.

**Rationale**: `SameSite=Lax` cookies are sent on top-level navigations (redirects from Google back to the app), which is exactly what the OAuth flow needs. `SameSite=Strict` would block the cookie on the redirect back from Google. `SameSite=None` requires `Secure` and is treated as a third-party cookie by Safari ITP. The Supabase SSR library sets `SameSite=Lax` by default, but this should be verified.

**Alternatives considered**:

- Storing PKCE verifier in `localStorage` instead of cookies — rejected because the server-side callback route can't read `localStorage`.
- Passing the verifier via URL parameters — rejected for security reasons (leaks in referrer headers and browser history).

### 4. Account Linking / Duplicate User Prevention

**Decision**: Investigate whether the "new user with no data" is a duplicate-account issue (email/password account exists separately from Google OAuth account) and recommend a clear UX path.

**Rationale**: Supabase's `enable_manual_linking = false` means if a user signed up with email/password and then tries Google OAuth with the same email, Supabase may either:

- Return an error ("User already registered")
- Create a separate user (if the emails don't match)

If the user's Google account email differs from their Typenote email/password account, Google OAuth WILL create a new, empty user. The fix should either show a clear message explaining this or support account linking.

**Alternatives considered**:

- Enabling automatic account linking (`enable_manual_linking = true`) — this requires careful security analysis and is a broader change that may warrant its own feature spec.
- Forcing all users to migrate to Google-only auth — too disruptive for existing users.

## Summary

Three issues must be addressed:

1. **Safari redirect reliability** — use `skipBrowserRedirect: true` + manual `window.location.href` assignment
2. **PKCE cookie verification** — ensure `SameSite=Lax` cookies persist through the redirect chain on Safari
3. **Duplicate user UX** — add clear error/guidance when Google OAuth creates a new user separate from an existing email/password account

No NEEDS CLARIFICATION items remain.
