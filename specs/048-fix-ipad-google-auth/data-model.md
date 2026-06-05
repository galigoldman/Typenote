# Data Model: Fix iPad Google OAuth Sign-In

**Feature**: 048-fix-ipad-google-auth
**Date**: 2026-05-27

## Overview

This is a client-side bug fix with no database schema changes. All relevant entities already exist.

## Existing Entities (No Changes)

### auth.users (Supabase managed)

The user record created by Supabase Auth. Google OAuth populates `raw_user_meta_data` with `name`, `avatar_url`, and `email`.

- `id` (UUID) — primary key
- `email` (text) — from Google account
- `raw_user_meta_data` (JSONB) — `{ name, avatar_url, email, ... }`
- `app_metadata` (JSONB) — contains `provider: "google"` for OAuth users

### profiles (public schema)

Created by the `handle_new_user` database trigger when a new `auth.users` row is inserted.

- `id` (UUID) — FK to `auth.users.id`
- `name` (text) — extracted from `raw_user_meta_data.name`
- `avatar_url` (text) — extracted from `raw_user_meta_data.avatar_url`

### documents (public schema)

User documents — keyed by `user_id`. When a new Google OAuth user is created, they have zero documents (empty workspace).

## State Transitions

```
User taps "Sign up/in with Google"
  → [Client] signInWithOAuth generates PKCE verifier + stores in cookie
  → [Client] Browser redirects to Google OAuth consent screen
  → [Google] User selects account, Google redirects to GoTrue
  → [GoTrue] Exchanges Google token, redirects to /auth/callback?code=XXX
  → [Server] /auth/callback reads PKCE cookie, calls exchangeCodeForSession
  → [Server] Session established, redirect to /dashboard
  → [Client] Dashboard loads with user's documents
```

**Failure mode (current bug)**: If the PKCE cookie is lost OR the redirect doesn't reach Google, the flow breaks at various points, leading to authentication failure or a new empty user being created.

## No Migrations Required

This fix is purely client-side (OAuth flow changes) and potentially Supabase config changes (`enable_manual_linking`). No new tables, columns, or database triggers are needed.
