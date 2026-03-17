# Quickstart: Auth & Account Management

**Feature Branch**: `010-auth-account-mgmt`
**Date**: 2026-03-17

## Prerequisites

- Local Supabase running (`supabase start`)
- `.env.local` with Supabase keys
- `pnpm install` completed

## What This Feature Adds

1. **Forgot Password page** (`/forgot-password`) — email-based password reset request
2. **Reset Password page** (`/reset-password`) — set new password after clicking email link
3. **Hardened login/signup** — sanitized error messages, no email enumeration, consistent validation
4. **Updated auth callback** — handles recovery flow in addition to OAuth

## Key Files

### New

- `src/app/(auth)/forgot-password/page.tsx` — forgot password form
- `src/app/(auth)/forgot-password/page.test.tsx` — tests
- `src/app/(auth)/reset-password/page.tsx` — reset password form
- `src/app/(auth)/reset-password/page.test.tsx` — tests
- `src/lib/auth-errors.ts` — error message sanitization utility

### Modified

- `src/app/(auth)/login/page.tsx` — add "Forgot password?" link + sanitize errors
- `src/app/(auth)/signup/page.tsx` — sanitize errors
- `src/app/auth/callback/route.ts` — handle `next` param for recovery redirect
- `src/lib/supabase/middleware.ts` — whitelist `/forgot-password` as public route

## Testing

```bash
# Run unit tests
pnpm test

# Run specific auth tests
pnpm test src/app/(auth)

# Run integration tests (requires local Supabase)
pnpm test:integration
```

## Manual Testing Checklist

- [ ] Sign up with new email → lands on dashboard
- [ ] Sign up with existing email → see generic error (no email leak)
- [ ] Log in with correct credentials → lands on dashboard
- [ ] Log in with wrong password → see "Invalid email or password"
- [ ] Click "Forgot password?" → lands on forgot-password page
- [ ] Submit email on forgot-password → see "Check your email" message
- [ ] Click reset link from email → lands on reset-password page
- [ ] Submit new password → redirect to login with success message
- [ ] Log in with new password → success
- [ ] Visit /login while authenticated → redirect to dashboard
- [ ] Visit /forgot-password while authenticated → redirect to dashboard

## Supabase Email Configuration

For local development, Supabase captures emails at `http://localhost:54324` (Inbucket). Check there for verification and reset emails during testing.

For production, configure email templates in Supabase Dashboard → Authentication → Email Templates:

- **Reset Password**: Customize the email text and set the redirect URL to `https://yourdomain.com/auth/callback?next=/reset-password`
