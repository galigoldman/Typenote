# Data Model: Auth & Account Management

**Feature Branch**: `010-auth-account-mgmt`
**Date**: 2026-03-17

## Overview

This feature requires **no new database tables or migrations**. All entities are managed by Supabase Auth (`auth.users`) and the existing `public.profiles` table. The password reset flow uses Supabase's built-in token system — no custom token storage needed.

## Existing Entities (no changes)

### auth.users (Supabase-managed)

Managed entirely by Supabase Auth. Not directly modified by application code.

| Field              | Description                              |
| ------------------ | ---------------------------------------- |
| id                 | UUID, primary key                        |
| email              | User's email address                     |
| encrypted_password | Bcrypt-hashed password                   |
| email_confirmed_at | Timestamp (null if unverified)           |
| raw_user_meta_data | JSONB — contains `full_name` from signup |
| created_at         | Timestamp                                |
| updated_at         | Timestamp                                |

**Relevant auth behaviors**:

- `resetPasswordForEmail()` generates a recovery token stored internally by Supabase
- `updateUser({ password })` updates `encrypted_password`
- Recovery tokens are single-use and time-limited (default: 24 hours, configurable in Supabase dashboard)

### public.profiles

Application-managed profile data, auto-created by `handle_new_user()` trigger.

| Field        | Description                                  |
| ------------ | -------------------------------------------- |
| id           | UUID, FK → auth.users(id), primary key       |
| email        | User's email (denormalized from auth.users)  |
| display_name | User's chosen display name                   |
| avatar_url   | Profile image URL (not used in this feature) |
| created_at   | Timestamp                                    |
| updated_at   | Timestamp (auto-updated by trigger)          |

**RLS Policies** (existing, no changes):

- `Users can view their own profile` — SELECT where `auth.uid() = id`
- `Users can update their own profile` — UPDATE where `auth.uid() = id`

## Entity Relationships

```
auth.users (Supabase-managed)
    │
    │ 1:1 (auto-created by trigger)
    ▼
public.profiles (application-managed)
```

## State Transitions

### Password Reset Flow (Supabase-managed)

```
[No token]
    → resetPasswordForEmail()
    → [Recovery token active, single-use, time-limited]
    → User clicks email link → exchangeCodeForSession()
    → [Temporary recovery session established]
    → updateUser({ password })
    → [Password updated, token consumed]
```

### User Authentication State

```
[Unauthenticated]
    → signUp() or signInWithPassword() or signInWithOAuth()
    → [Authenticated, session active]
    → signOut()
    → [Unauthenticated]
```

## Migration Impact

**None.** No new tables, columns, RLS policies, or triggers required. The feature exclusively uses:

- Existing Supabase Auth SDK methods
- Existing `public.profiles` table (read-only for this feature)
- Supabase's internal token management
