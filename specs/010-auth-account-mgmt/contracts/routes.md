# Route Contracts: Auth & Account Management

**Feature Branch**: `010-auth-account-mgmt`
**Date**: 2026-03-17

## New Routes

### GET /forgot-password

**Purpose**: Password reset request form
**Access**: Public (unauthenticated only — authenticated users redirected to dashboard)
**Renders**: Form with email input + submit button
**User interaction**: Enter email → submit → see "Check your email" confirmation

### GET /reset-password

**Purpose**: Set new password after clicking recovery link from email
**Access**: Authenticated (user has temporary recovery session from email link)
**Renders**: Form with new password + confirm password inputs
**User interaction**: Enter new password twice → submit → redirect to `/login` with success message
**Error states**: Expired/invalid token → error message + link to request new reset

## Modified Routes

### GET /login

**Changes**:
- Add "Forgot password?" link below the password field, navigating to `/forgot-password`
- Sanitize error messages — never expose raw Supabase errors
- Accept `?message=password-reset-success` query param to show success banner after reset

### GET /signup

**Changes**:
- Sanitize error messages — never expose whether email is already registered
- Improve client-side validation feedback (inline errors for empty fields)

### GET /auth/callback

**Changes**:
- Support `next` query parameter for post-callback redirect
- Handle recovery flow: when `next=/reset-password`, redirect to reset page instead of dashboard

## Route Access Matrix

| Route | Unauth | Auth | Auth (recovery) |
| ----- | ------ | ---- | --------------- |
| /login | Allowed | → /dashboard | → /dashboard |
| /signup | Allowed | → /dashboard | → /dashboard |
| /forgot-password | Allowed | → /dashboard | → /dashboard |
| /reset-password | → /login | → /dashboard | Allowed |
| /auth/callback | Allowed | Allowed | Allowed |
| /dashboard/* | → /login | Allowed | Allowed |

## Middleware Changes

Update `isAuthPage` check in `src/lib/supabase/middleware.ts` to include `/forgot-password` as a public route. `/reset-password` stays protected (requires the recovery session).
