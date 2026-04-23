# Quickstart: Document Version History

## Prerequisites

- Local Supabase running (`supabase start`)
- `pnpm install` done
- `.env.local` configured

## Development Steps

### 1. Apply the migration

```bash
supabase migration new create_document_versions
# Write the SQL (see data-model.md)
supabase db reset
```

### 2. Update seed data

Add sample version records for the test document in `supabase/seed.sql`.

### 3. New files to create

```
supabase/migrations/YYYYMMDDHHMMSS_create_document_versions.sql
src/types/database.ts                          # Add DocumentVersion type
src/lib/actions/document-versions.ts           # Server actions
src/lib/queries/document-versions.ts           # Query functions
src/hooks/use-version-snapshots.ts             # Client-side trigger logic
src/components/version-history/version-sidebar.tsx  # UI sidebar
src/app/api/version-snapshot/route.ts          # Beacon endpoint
```

### 4. Files to modify

```
src/hooks/use-document-sync.ts                 # Wire in version snapshot hook
src/components/canvas/canvas-editor.tsx         # Add version sidebar toggle
src/components/editor/tiptap-editor.tsx         # Add version sidebar toggle (text docs)
```

### 5. Run tests

```bash
pnpm test                  # Unit tests
pnpm test:integration      # Integration tests (needs local Supabase)
pnpm test:e2e              # E2E tests
```

## Key Decisions

- **Full snapshots, not diffs** — simpler restore, negligible storage at 8-version cap
- **Client-side triggers, server-side storage** — only the client knows when user is idle
- **RPC for atomicity** — cap enforcement can't race across tabs
- **sendBeacon for close** — browser guarantees delivery after page unload
