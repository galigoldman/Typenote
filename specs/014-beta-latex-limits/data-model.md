# Data Model: 014-beta-latex-limits

**Date**: 2026-03-23
**Branch**: `014-beta-latex-limits`

## Migration: `00018_beta_latex_quota_separation.sql`

### 1. Modify `ai_usage` table

**Add columns:**

| Column                | Type              | Default  | Purpose                                       |
| --------------------- | ----------------- | -------- | --------------------------------------------- |
| `query_type`          | `text NOT NULL`   | `'chat'` | Distinguishes chat vs latex usage             |
| `total_input_tokens`  | `bigint NOT NULL` | `0`      | Cumulative input tokens (observability only)  |
| `total_output_tokens` | `bigint NOT NULL` | `0`      | Cumulative output tokens (observability only) |

**Modify unique index:**

```sql
DROP INDEX ai_usage_user_month_idx;

CREATE UNIQUE INDEX ai_usage_user_month_type_idx
  ON ai_usage (user_id, usage_month, query_type);
```

### 2. Existing `profiles.subscription_tier` column

**No schema change.** The new `'beta'` value is just a new application-level tier label.

### 3. RPC: `increment_ai_usage` (modified)

**New parameter:** `p_query_type text DEFAULT 'chat'`

**Behavior changes:**

- Upsert keyed on `(user_id, usage_month, query_type)` instead of `(user_id, usage_month)`
- Limit resolution uses both tier and query_type (chat limits for `'chat'`, latex limits for `'latex'`)
- Adds `'beta'` tier: chat=100, latex=500

**Return type:** unchanged — `(current_count, monthly_limit, tier, is_allowed)`

**Note:** Token columns are NOT updated by this RPC. They are updated separately via a fire-and-forget `UPDATE` after the AI call.

### 4. RPC: `get_ai_quota` (modified)

Returns two rows (one per query_type) instead of one. New return column: `query_type text`.

### 5. VIEW: `admin_user_ai_usage` (new)

```sql
CREATE OR REPLACE VIEW admin_user_ai_usage AS
SELECT
  p.id AS user_id,
  p.display_name,
  p.email,
  p.subscription_tier,
  au.usage_month,
  au.query_type,
  au.query_count,
  au.total_input_tokens,
  au.total_output_tokens,
  au.updated_at
FROM profiles p
LEFT JOIN ai_usage au ON au.user_id = p.id
ORDER BY au.usage_month DESC, p.display_name;
```

## Entity Relationship Summary

```
profiles (existing)
  ├── id (uuid, PK)
  ├── subscription_tier (text: 'free' | 'beta' | 'pro')
  └── ...
       │ 1:N
       ▼
ai_usage (modified)
  ├── id (bigserial, PK)
  ├── user_id (uuid, FK → auth.users)
  ├── usage_month (text, 'YYYY-MM')
  ├── query_type (text, 'chat' | 'latex')     ← NEW
  ├── query_count (integer)
  ├── total_input_tokens (bigint)              ← NEW (fire-and-forget)
  ├── total_output_tokens (bigint)             ← NEW (fire-and-forget)
  ├── last_model (text)
  ├── created_at (timestamptz)
  └── updated_at (timestamptz)
  UNIQUE: (user_id, usage_month, query_type)   ← MODIFIED
```

## Tier Limits Matrix

| Tier | Chat | LaTeX | Deep Mode |
| ---- | ---- | ----- | --------- |
| free | 50   | 150   | blocked   |
| beta | 100  | 500   | blocked   |
| pro  | 500  | 1500  | allowed   |
