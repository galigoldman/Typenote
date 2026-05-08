# Quickstart: UI Redesign

## Prerequisites

- Node.js 22+, pnpm
- Local Supabase running (`supabase start`)
- `.env.local` configured

## Setup

```bash
git checkout 041-ui-redesign
pnpm install
pnpm dev
```

## Key Files to Modify

### Global Styles

- `src/app/globals.css` — CSS custom properties (color scheme)

### Sidebar

- `src/app/(dashboard)/layout.tsx` — Sidebar content (logo, sign out)
- `src/components/dashboard/sidebar-layout.tsx` — Sidebar container styling
- `src/components/dashboard/sidebar-folder-tree.tsx` — Folder tree styling

### Dashboard

- `src/app/(dashboard)/dashboard/page.tsx` — Dashboard layout/sections
- `src/components/dashboard/course-card.tsx` — Course card styling
- `src/components/dashboard/folder-card.tsx` — Folder card styling
- `src/components/dashboard/document-card.tsx` — Document card + top border
- `src/components/dashboard/moodle-sync-prompt.tsx` — Moodle banner

### Editor

- `src/components/editor/tiptap-editor.tsx` — Title and content styling
- `src/components/editor/editor-toolbar.tsx` — Toolbar styling
- `src/app/(dashboard)/dashboard/documents/[docId]/page.tsx` — Course breadcrumb

### AI Panel

- `src/components/ai/ai-chat-panel.tsx` — Header, messages, input styling

## Testing

```bash
pnpm test              # Unit tests
pnpm test:integration  # Integration tests
pnpm test:e2e          # E2E browser tests
```

## Verification

After each change, verify:

1. Dashboard renders correctly with new card styles
2. Editor page renders with updated toolbar and title styling
3. AI panel shows "AI Tutor" branding with correct message styling
4. Mobile sidebar sheet works correctly
5. All existing functionality preserved
