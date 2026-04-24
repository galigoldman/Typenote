# Implementation Plan: Document Version History

**Branch**: `039-document-versioning` | **Date**: 2026-04-12 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/039-document-versioning/spec.md`

## Summary

Add automatic document versioning that saves up to 8 snapshots per document at smart intervals (30s idle, 5min periodic, session close). Users can browse versions in a sidebar and restore any version — with a safety snapshot always created before restore. Storage uses full JSONB snapshots in a new `document_versions` table with atomic cap enforcement via Postgres RPC.

## Technical Context

**Language/Version**: TypeScript 5 / Node.js 22+
**Primary Dependencies**: Next.js 16 (App Router), React 19, Supabase SSR, TipTap 3, shadcn/ui
**Storage**: PostgreSQL via Supabase — new `document_versions` table
**Testing**: Vitest (unit/integration), Playwright (E2E)
**Target Platform**: Web (desktop + mobile browsers)
**Project Type**: Web application (Next.js App Router)
**Performance Goals**: Snapshot creation < 5s, restore < 2s
**Constraints**: Max 8 versions per document, sendBeacon for session close
**Scale/Scope**: Single new table, 1 RPC function, 1 API route, 1 hook, 1 sidebar component

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                       | Status | Notes                                                                                        |
| ------------------------------- | ------ | -------------------------------------------------------------------------------------------- |
| I. Incremental Development      | PASS   | Database schema + RPC first, then hook, then UI. Each phase produces a working increment.    |
| II. Test-Driven Quality         | PASS   | Integration tests for migration/RPC, unit tests for hook logic, E2E for full user flow.      |
| III. Protected Branches         | PASS   | Feature branch `039-document-versioning` off `dev`. PR to `dev` after CI passes.             |
| IV. Migrations as Code          | PASS   | New migration file for `document_versions` table + RPC functions. Seed data updated.         |
| V. Interview-Ready Architecture | PASS   | Covers: ring-buffer pattern, atomic RPC, sendBeacon API, JSONB snapshots vs diffs trade-off. |

**Post-Phase 1 re-check**: All gates still pass. No constitution violations.

## Project Structure

### Documentation (this feature)

```text
specs/039-document-versioning/
├── plan.md
├── spec.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── server-actions.md
├── checklists/
│   └── requirements.md
└── tasks.md              # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
supabase/
├── migrations/
│   └── YYYYMMDDHHMMSS_create_document_versions.sql  # NEW: table + RPC + RLS
└── seed.sql                                          # MODIFIED: add sample versions

src/
├── types/
│   └── database.ts                    # MODIFIED: add DocumentVersion type
├── lib/
│   ├── actions/
│   │   └── document-versions.ts       # NEW: createVersionSnapshot, restoreDocumentVersion
│   └── queries/
│       └── document-versions.ts       # NEW: getDocumentVersions
├── hooks/
│   ├── use-version-snapshots.ts       # NEW: idle/periodic/close trigger logic
│   └── use-document-sync.ts           # MODIFIED: wire in version snapshots
├── components/
│   └── version-history/
│       └── version-sidebar.tsx        # NEW: sidebar UI
├── app/
│   └── api/
│       └── version-snapshot/
│           └── route.ts               # NEW: beacon endpoint for session close
└── components/
    ├── canvas/
    │   └── canvas-editor.tsx          # MODIFIED: add version sidebar toggle
    └── editor/
        └── tiptap-editor.tsx          # MODIFIED: add version sidebar toggle (text docs)
```

**Structure Decision**: Follows the existing project layout. New files go in the same directories as their closest analogues (e.g., `document-versions.ts` actions next to `documents.ts` actions). The version sidebar gets its own `version-history/` component directory to keep it isolated.
