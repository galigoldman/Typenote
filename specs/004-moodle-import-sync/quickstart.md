# Quickstart: Moodle Import & Sync

**Feature**: `004-moodle-import-sync` | **Date**: 2026-03-11

## Prerequisites

- Node.js 18+, pnpm
- Local Supabase running (`supabase start`)
- Chrome/Chromium browser (for extension testing)

## Setup

### 1. Database

```bash
# Create the new migrations
supabase migration new create_moodle_shared_registry
supabase migration new create_moodle_user_syncs

# After writing SQL, verify
supabase db reset
```

### 2. Extension Development

```bash
cd extension
pnpm install
pnpm dev          # watch mode, outputs to extension/dist/
```

Load in Chrome:

1. Navigate to `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked" → select `extension/dist/`
4. Note the extension ID for the web app config

### 3. Web App Configuration

Add to `.env.local`:

```
NEXT_PUBLIC_EXTENSION_ID=<your-extension-id>
SUPABASE_SERVICE_ROLE_KEY=<from-supabase-status>
```

The service role key is needed for the API routes that write to shared tables.

### 4. Run

```bash
pnpm dev          # Next.js dev server
```

## Development Flow

1. **DB first**: Write migration SQL for shared tables → `supabase db reset` → integration tests
2. **API routes**: Build `/api/moodle/sync`, `/api/moodle/upload`, `/api/moodle/import` → unit + integration tests
3. **Extension scaffold**: Manifest V3 setup, messaging protocol, service worker → manual testing
4. **Extension scraping**: Use browser-use to learn Moodle DOM → implement content scripts
5. **UI components**: Sync dialog, file picker, connection setup → component tests
6. **End-to-end**: Full flow from Typenote app → extension → Moodle → back

## Key Files to Read First

| File                                           | Why                                      |
| ---------------------------------------------- | ---------------------------------------- |
| `specs/004-moodle-import-sync/data-model.md`   | Understand shared vs per-user tables     |
| `specs/004-moodle-import-sync/contracts/`      | API and messaging contracts              |
| `src/lib/queries/courses.ts`                   | Existing query patterns to follow        |
| `src/lib/actions/courses.ts`                   | Existing server action patterns          |
| `supabase/migrations/00003_create_courses.sql` | Existing RLS pattern for per-user tables |

## Testing Strategy

| Layer               | Tool               | What                                                        |
| ------------------- | ------------------ | ----------------------------------------------------------- |
| DB schema + RLS     | Vitest integration | Shared table read access, service role writes, per-user RLS |
| Dedup logic         | Vitest unit        | URL match, hash match, new file scenarios                   |
| API routes          | Vitest integration | Sync upsert, upload dedup, import recording                 |
| Extension messaging | Manual + mocked    | Ping, login check, scrape, download/upload                  |
| Full sync flow      | Playwright e2e     | End-to-end with extension + Moodle mock                     |
