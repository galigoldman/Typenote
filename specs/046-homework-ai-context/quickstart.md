# Quickstart: Homework AI Context

## Prerequisites

- Local Supabase running (`supabase start`)
- `pnpm install` completed
- `.env.local` configured

## Implementation Order

1. **Database migration** — Create `homework_sessions` and `homework_session_materials` tables with RLS
2. **TypeScript types** — Add `HomeworkSession`, `HomeworkSessionMaterial`, `HomeworkContext` to `src/types/database.ts`
3. **Server actions** — `createHomeworkSession` and `getHomeworkContext` in `src/lib/actions/homework.ts`
4. **Seed data** — Add homework session test data to `supabase/seed.sql`
5. **UI: StartHomeworkDialog** — Dialog component for selecting exercise + materials
6. **Course page integration** — Add "Start Homework" button next to "New Document"
7. **AI context injection** — Extend `/api/ai/ask` to handle `homeworkSessionId`
8. **System prompt** — Add `isHomeworkMode` to `buildSystemPrompt`
9. **UI: HomeworkContextBadges** — Show linked context in AI chat panel
10. **Prop threading** — Pass homework context through DocumentPage → DocumentWithAi → AiChatWrapper → AiChatPanel

## Key Commands

```bash
# Create migration
supabase migration new create_homework_sessions

# Verify migration
supabase db reset

# Run tests
pnpm test && pnpm test:integration

# Run E2E
pnpm test:e2e
```

## Test Strategy

- **Unit tests**: Server action logic (createHomeworkSession, getHomeworkContext)
- **Integration tests**: DB operations with RLS verification, homework session CRUD
- **E2E tests**: Full flow — Start Homework → select exercise → select materials → confirm → verify AI context
