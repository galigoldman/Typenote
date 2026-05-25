# Quickstart: Document Tabs

## Prerequisites

- Node.js 22+, pnpm installed
- Local Supabase running (`supabase start`)
- `.env.local` configured with local Supabase keys
- At least 2 documents created (via seed data or manually)

## Key Files to Understand

| File | What It Does |
|---|---|
| `src/app/(dashboard)/dashboard/documents/[docId]/page.tsx` | Server component — fetches document and renders editor |
| `src/components/editor/tiptap-editor-with-versions.tsx` | Text editor wrapper (TipTap + version sidebar) |
| `src/components/canvas/canvas-editor.tsx` | Canvas/drawing editor |
| `src/components/ai/document-with-ai.tsx` | Canvas editor + AI chat wrapper |
| `src/components/dashboard/sidebar-layout.tsx` | Dashboard layout with collapsible sidebar |
| `src/components/dashboard/document-card.tsx` | Document link card on dashboard |
| `src/components/dashboard/sidebar-folder-tree.tsx` | Sidebar navigation tree |
| `src/hooks/use-document-sync.ts` | Document save/sync orchestrator hook |
| `src/lib/actions/documents.ts` | Server actions for document CRUD |

## Development Workflow

```bash
# 1. Make sure you're on the feature branch
git checkout 044-document-tabs

# 2. Start local dev environment
supabase start
pnpm dev

# 3. Open browser to http://localhost:3000
# 4. Log in with test@typenote.dev / Test1234
# 5. Navigate to a document — this is where tabs will appear

# 6. Run tests after changes
pnpm test                # Unit tests
pnpm test:integration    # Integration tests (needs Supabase)
pnpm test:e2e           # E2E browser tests
```

## Architecture Notes

- **No database changes** — tab state lives in localStorage + React context
- **Two editor types** — TipTap (text-only) and Canvas (drawing). Both must work under tabs.
- **Server component page** — `page.tsx` is a server component. Tabs operate client-side, so a new data-fetching path (server action) is needed for loading documents into tabs.
- **Realtime sync** — each document subscribes to a Supabase channel. Only the active tab's editor should maintain a realtime subscription.
- **Auto-save** — the `useAutoSave` hook runs per editor instance. Ensure save flushes when switching away from a tab.
