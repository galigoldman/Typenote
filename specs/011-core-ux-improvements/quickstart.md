# Quickstart: Core UX Improvements

**Feature Branch**: `011-core-ux-improvements`

---

## Prerequisites

- Node.js 22+
- pnpm installed
- Supabase CLI installed
- Local Supabase running (`supabase start`)

## Setup

```bash
# Switch to the feature branch
git checkout 011-core-ux-improvements

# Install dependencies (no new packages needed for this feature)
pnpm install

# Apply the new migration (creates ai_conversations, ai_messages tables)
supabase db reset

# Start dev server
pnpm dev
```

## Key Files to Modify

### Sub-Feature A: Auto-Save Retry

| File | Change |
|------|--------|
| `src/hooks/use-auto-save.ts` | Add retry logic, error classification, new status states |
| `src/hooks/use-document-sync.ts` | Add reconnection-triggered retry, manual save |
| `src/components/canvas/canvas-editor.tsx` | Add Save button, expand SaveIndicator with error details |
| `src/hooks/use-realtime-sync.ts` | Expose connection status changes for retry trigger |

### Sub-Feature B: Document Move

| File | Change |
|------|--------|
| `src/lib/actions/documents.ts` | Extend `moveDocument` for course/week/folder destinations |
| `src/components/dashboard/move-document-dialog.tsx` | **New** — dialog with course/folder tree |
| `src/components/dashboard/document-card.tsx` | Wire `onMove` to open MoveDocumentDialog |
| `src/app/(dashboard)/dashboard/page.tsx` | Pass `onMove` handler to DocumentCard |
| `src/app/(dashboard)/dashboard/folders/[folderId]/page.tsx` | Pass `onMove` handler to DocumentCard |
| `src/app/(dashboard)/dashboard/courses/[courseId]/page.tsx` | Pass `onMove` handler to DocumentCard |

### Sub-Feature C: AI Conversation Persistence

| File | Change |
|------|--------|
| `supabase/migrations/00017_ai_conversations.sql` | **New** — create tables |
| `supabase/seed.sql` | Add seed conversations and messages |
| `src/types/database.ts` | Add `AiConversation`, `AiMessage` interfaces |
| `src/lib/actions/conversations.ts` | **New** — conversation CRUD server actions |
| `src/app/api/ai/ask/route.ts` | Add conversation persistence (create/continue) |
| `src/app/api/ai/conversations/route.ts` | **New** — list conversations endpoint |
| `src/app/api/ai/conversations/[conversationId]/messages/route.ts` | **New** — get messages endpoint |
| `src/app/api/ai/conversations/[conversationId]/route.ts` | **New** — delete/update conversation |
| `src/components/ai/ai-chat-panel.tsx` | Major refactor — load/save conversations, list view toggle |
| `src/components/ai/conversation-list.tsx` | **New** — conversation list component |

## Testing

```bash
# Run unit tests
pnpm test

# Run integration tests (requires local Supabase)
pnpm test:integration

# Run all tests
pnpm test && pnpm test:integration
```

## Test Files to Create

| File | Coverage |
|------|----------|
| `src/hooks/use-auto-save.test.ts` | Retry logic, error classification, status transitions |
| `src/lib/actions/documents.test.ts` | Extended moveDocument with all destination types |
| `src/lib/actions/conversations.test.ts` | Conversation CRUD |
| `src/lib/actions/conversations.integration.test.ts` | DB operations, RLS policies, cascade deletes |
| `supabase/migrations/00017_ai_conversations.integration.test.ts` | Migration, RLS, indexes |
| `src/app/api/ai/ask/route.test.ts` | Conversation persistence in AI endpoint |
| `src/components/ai/ai-chat-panel.test.tsx` | Panel state management, view toggling |
| `src/components/dashboard/move-document-dialog.test.tsx` | Tree rendering, destination selection |
