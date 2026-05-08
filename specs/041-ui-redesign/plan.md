# Implementation Plan: UI Redesign

**Branch**: `041-ui-redesign` | **Date**: 2026-05-08 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/041-ui-redesign/spec.md`

## Summary

Visual restyling of the existing Typenote UI to match a polished design mockup. No new features or functionality — only CSS, layout, and text changes to existing components. Key changes: warmer color scheme, elevated card styles on dashboard, course breadcrumb as pill badge, AI panel message role labels and teal user bubbles, sidebar branding update.

## Technical Context

**Language/Version**: TypeScript 5 / Node.js 22+
**Primary Dependencies**: Next.js 16 (App Router), React 19, Tailwind CSS 4, shadcn/ui (New York), Lucide icons
**Storage**: N/A — no database changes
**Testing**: Vitest (unit/integration), Playwright (E2E)
**Target Platform**: Web (desktop + mobile/tablet)
**Project Type**: Web application
**Performance Goals**: No performance impact — CSS-only changes
**Constraints**: Zero functional regressions; all existing tests must pass
**Scale/Scope**: ~12 component files modified, 1 CSS file updated

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                       | Status | Notes                                                                          |
| ------------------------------- | ------ | ------------------------------------------------------------------------------ |
| I. Incremental Development      | PASS   | Purely visual changes, no new infrastructure needed                            |
| II. Test-Driven Quality         | PASS   | Existing tests verify functionality; test updates only for changed text/labels |
| III. Protected Branches         | PASS   | Working on feature branch `041-ui-redesign`, will PR to `dev`                  |
| IV. Migrations as Code          | PASS   | No migrations needed — no schema changes                                       |
| V. Interview-Ready Architecture | PASS   | CSS theming with custom properties is a standard pattern                       |

**Post-Phase 1 Re-check**: All gates still pass. No data model or infrastructure changes introduced.

## Project Structure

### Documentation (this feature)

```text
specs/041-ui-redesign/
├── plan.md              # This file
├── research.md          # Phase 0 output — styling deltas identified
├── data-model.md        # Phase 1 output — no schema changes needed
├── quickstart.md        # Phase 1 output — setup instructions
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code (files to modify)

```text
src/
├── app/
│   ├── globals.css                                    # CSS variables (color scheme)
│   └── (dashboard)/
│       ├── layout.tsx                                 # Sidebar content (logo branding)
│       └── dashboard/
│           ├── page.tsx                               # Dashboard section headers
│           └── documents/[docId]/page.tsx             # Course breadcrumb pill
├── components/
│   ├── ai/
│   │   └── ai-chat-panel.tsx                          # Message labels, user bubble color
│   ├── canvas/
│   │   └── canvas-editor.tsx                          # Toolbar integration (if needed)
│   ├── dashboard/
│   │   ├── course-card.tsx                            # Elevated card style
│   │   ├── document-card.tsx                          # Top border bar
│   │   ├── folder-card.tsx                            # Elevated card style
│   │   ├── moodle-sync-prompt.tsx                     # Banner card restyle
│   │   ├── sidebar-folder-tree.tsx                    # Tree hover/active states
│   │   └── sidebar-layout.tsx                         # Sidebar background
│   └── editor/
│       ├── editor-toolbar.tsx                         # Toolbar button styling
│       └── tiptap-editor.tsx                          # Title and content typography
```

**Structure Decision**: No new files or directories needed. All changes are modifications to existing components and the global CSS file.

## Implementation Phases

### Phase 1: Color Scheme & Global CSS (FR-014)

**Files**: `src/app/globals.css`

**Changes**:

- Update `--background` to a warmer off-white tone (shift hue from cool 293 toward warm ~60-80)
- Update `--sidebar` (or add if missing) to a cream/beige tone for the sidebar background
- Ensure `--card` stays white for card elevation contrast
- Increase `--radius` slightly if needed for the ~12px rounded corners in mockup (current base is 0.625rem ≈ 10px)
- Verify dark mode still looks good with the hue shifts

**Why**: Global CSS variables cascade to all components. Changing them first gives immediate visual feedback across the entire app.

### Phase 2: Sidebar Restyling (FR-001, FR-002)

**Files**: `src/app/(dashboard)/layout.tsx`, `src/components/dashboard/sidebar-layout.tsx`, `src/components/dashboard/sidebar-folder-tree.tsx`

**Changes**:

- `layout.tsx`: Restyle the logo/title area with purple branding (larger font, `text-primary` color, possibly add a small icon)
- `sidebar-layout.tsx`: Update `bg-sidebar` class references to use the new sidebar background color
- `sidebar-folder-tree.tsx`: Update hover states to use `hover:bg-primary/10`, active states to use `bg-primary/10 text-primary`, increase spacing between items

**Why**: The sidebar is visible on every page. Restyling it early ensures a consistent foundation.

### Phase 3: Dashboard Card Restyling (FR-003, FR-004, FR-005)

**Files**: `src/components/dashboard/course-card.tsx`, `src/components/dashboard/document-card.tsx`, `src/components/dashboard/folder-card.tsx`, `src/components/dashboard/moodle-sync-prompt.tsx`, `src/app/(dashboard)/dashboard/page.tsx`

**Changes**:

- `course-card.tsx`: Replace current inline list-item styling (`rounded-lg border p-4`) with elevated card styling (`rounded-xl bg-card shadow-sm p-5`) matching the mockup's course cards with icon + name + label
- `folder-card.tsx`: Same elevated card treatment as course cards
- `document-card.tsx`: Add a 4px colored top border bar using the subject color from `SUBJECT_COLORS`. Map subject colors to border colors (e.g., `border-t-4` with inline `borderTopColor` from the subject mapping)
- `moodle-sync-prompt.tsx`: Increase padding, add an icon, make the button more prominent with `variant="default"` (purple primary) and larger sizing
- `page.tsx`: Update section headers to use bolder, larger typography

**Why**: Dashboard cards are the most visually impactful change — users see them immediately on login.

### Phase 4: Editor Restyling (FR-006, FR-007, FR-012)

**Files**: `src/app/(dashboard)/dashboard/documents/[docId]/page.tsx`, `src/components/editor/tiptap-editor.tsx`, `src/components/editor/editor-toolbar.tsx`

**Changes**:

- `[docId]/page.tsx`: Restyle the course breadcrumb link from current pill style to uppercase text in a green/primary-tinted pill badge (e.g., `uppercase text-xs tracking-wider bg-green-100 text-green-800`)
- `tiptap-editor.tsx`: Update title input to larger size (`text-3xl` or `text-4xl`) with purple tint. Update content area typography (line-height, padding)
- `editor-toolbar.tsx`: Refine button sizing for consistency, ensure hover/active states use the new purple accent consistently

**Why**: The editor is where users spend most time — typography improvements enhance the writing experience.

### Phase 5: AI Panel Restyling (FR-008, FR-009, FR-010, FR-011)

**Files**: `src/components/ai/ai-chat-panel.tsx`

**Changes**:

- Header: Icon already uses `#6355C0` and text already says "AI Tutor" — update icon color to green/teal to match mockup (`text-emerald-600` or similar)
- Quick/Deep toggle: Already functional — just update the label text if needed (already shows "Quick"/"Deep")
- Messages: Add "AI ASSISTANT" label above assistant messages and "YOU" label above user messages. Change user message bubble from `bg-primary` (purple) to teal/green (`bg-teal-600 text-white` or similar)
- Input: Update placeholder to "Ask anything about your course materials..." (may already be set). Ensure send button uses purple styling

**Why**: The AI panel branding change is a key visual differentiator.

### Phase 6: Test Updates

**Files**: Any test files that assert on changed text/labels

**Changes**:

- If tests check for specific text like "Quick"/"Deep" labels, header text, or color classes — update assertions to match new values
- Run `pnpm test && pnpm test:integration && pnpm test:e2e` and fix any failures
- Most tests should pass unchanged since functionality is preserved

**Why**: Constitution requires all tests to pass before PR.

## Complexity Tracking

No complexity violations. All changes are CSS/styling modifications to existing components with no new abstractions, dependencies, or infrastructure.
