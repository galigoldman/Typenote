# Quickstart: 014-beta-latex-limits

**Date**: 2026-03-23
**Branch**: `014-beta-latex-limits`

## Overview

This feature adds:

1. A "beta" subscription tier with 100 chat + 500 LaTeX queries/month
2. Separate quota tracking for chat vs LaTeX queries
3. Course name context in LaTeX prompts
4. Deep mode restricted to pro tier only
5. Split quota display in the AI chat panel
6. Admin SQL view for per-user query counts

## Files to Modify

### Database (1 new migration)

| File                                                        | Change                               |
| ----------------------------------------------------------- | ------------------------------------ |
| `supabase/migrations/00018_beta_latex_quota_separation.sql` | New column, updated RPCs, admin view |

### Backend (6 files)

| File                            | Change                                            |
| ------------------------------- | ------------------------------------------------- |
| `src/lib/ai/rate-limit.ts`      | Add beta tier, query_type support, LaTeX limits   |
| `src/lib/ai/latex.ts`           | Accept `courseName`, return full result for usage |
| `src/lib/ai/prompts.ts`         | Add `buildLatexPrompt(courseName?)` helper        |
| `src/app/api/ai/latex/route.ts` | Accept `courseName`, use 'latex' query_type       |
| `src/app/api/ai/ask/route.ts`   | Add deep mode tier check                          |
| `src/app/api/ai/quota/route.ts` | Return per-type quota with `deepModeAvailable`    |

### Frontend (4 files)

| File                                       | Change                                     |
| ------------------------------------------ | ------------------------------------------ |
| `src/components/ai/ai-chat-panel.tsx`      | Split quota display, lock deep mode toggle |
| `src/components/editor/math-node-view.tsx` | Pass `courseName` in LaTeX API call        |
| `src/components/editor/tiptap-editor.tsx`  | Pass `courseName` in LaTeX API call        |
| `src/components/canvas/canvas-editor.tsx`  | Pass `courseName` in LaTeX API call        |

## Implementation Order

1. **Migration** — Schema changes first (everything depends on this)
2. **rate-limit.ts** — Core logic (beta tier, query_type, LaTeX limits)
3. **LaTeX backend** — latex.ts + prompts.ts + route changes
4. **Ask route** — Deep mode restriction
5. **Quota route** — New response shape
6. **Frontend** — Chat panel quota display + deep mode lock + LaTeX callers pass courseName
7. **Tests** — Update all existing + add new test cases

## Environment Variables (new)

| Variable              | Default | Purpose                           |
| --------------------- | ------- | --------------------------------- |
| `AI_LIMIT_BETA`       | 100     | Monthly chat limit for beta tier  |
| `AI_LATEX_LIMIT_FREE` | 150     | Monthly LaTeX limit for free tier |
| `AI_LATEX_LIMIT_BETA` | 500     | Monthly LaTeX limit for beta tier |
| `AI_LATEX_LIMIT_PRO`  | 1500    | Monthly LaTeX limit for pro tier  |

## Assigning Beta Tier

```sql
UPDATE profiles SET subscription_tier = 'beta' WHERE email = 'user@example.com';
```

## Admin Usage Query

```sql
SELECT * FROM admin_user_ai_usage
WHERE usage_month = to_char(CURRENT_DATE, 'YYYY-MM')
ORDER BY query_count DESC;
```
