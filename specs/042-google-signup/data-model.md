# Data Model: Google Sign-Up as Only Registration Option

**Feature**: 042-google-signup
**Date**: 2026-05-18

## Schema Changes

**None.** This feature requires no database changes.

## Existing Entities (unchanged)

### Profile

The `profiles` table already handles Google OAuth users correctly.

| Field        | Type        | Source (Google OAuth)               |
| ------------ | ----------- | ----------------------------------- |
| id           | uuid (PK)   | `auth.users.id` (auto-generated)    |
| email        | text        | `auth.users.email` (from Google)    |
| display_name | text        | `raw_user_meta_data->>'name'`       |
| avatar_url   | text        | `raw_user_meta_data->>'avatar_url'` |
| created_at   | timestamptz | `now()` (default)                   |
| updated_at   | timestamptz | `now()` (default, auto-updated)     |

### Trigger: `handle_new_user`

Fires `AFTER INSERT ON auth.users`. Creates a `profiles` row using:

- `full_name` or `name` from `raw_user_meta_data` (Google provides `name`)
- `avatar_url` from `raw_user_meta_data` (Google provides this)
- Falls back to email username if no name is available

No modifications needed — this trigger already works for Google OAuth users.

## Migrations

No new migration files required.
