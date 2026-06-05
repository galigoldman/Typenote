# Implementation Plan: LaTeX Onboarding Tooltip

**Branch**: `050-latex-onboarding-tooltip` | **Date**: 2026-06-04 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/050-latex-onboarding-tooltip/spec.md`

## Summary

Add a LaTeX icon to the editor toolbar that shows an onboarding popover on first use, explaining the `:{` shortcut for AI LaTeX conversion. The popover includes a short, motivating message with a before/after illustration and a "Got it" dismissal button. After dismissal (persisted via localStorage), the icon remains clickable to re-show the help popover (without "Got it"). No database or API changes — purely client-side UI.

## Technical Context

**Language/Version**: TypeScript 5 / Node.js 22+
**Primary Dependencies**: React 19, Next.js 16 (App Router), Lucide icons, shadcn/ui (Tooltip, Button), Tailwind CSS 4
**Storage**: N/A — localStorage only (dismissal flag)
**Testing**: Vitest (unit), Playwright (E2E)
**Target Platform**: Web (desktop + mobile/tablet)
**Project Type**: Web application (Next.js)
**Performance Goals**: N/A — static UI component, no performance-sensitive logic
**Constraints**: Popover must not interfere with editor interaction; illustration must be bundled (no external fetch)
**Scale/Scope**: Single component addition to existing toolbar

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                       | Status | Notes                                                                                                                                                       |
| ------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I. Incremental Development      | PASS   | Purely additive UI — no foundational changes needed. The LaTeX feature (`:{` trigger) already exists and is tested. This adds a discovery mechanism on top. |
| II. Test-Driven Quality         | PASS   | Will include unit tests for the popover component and localStorage logic, plus E2E tests for the first-time and on-demand flows.                            |
| III. Protected Branches         | PASS   | Working on feature branch `050-latex-onboarding-tooltip`, will PR to `dev`.                                                                                 |
| IV. Migrations as Code          | N/A    | No database changes.                                                                                                                                        |
| V. Interview-Ready Architecture | PASS   | Feature demonstrates: progressive disclosure UX pattern, localStorage for lightweight persistence, component composition.                                   |

**Gate result**: All gates pass. No violations to justify.

## Project Structure

### Documentation (this feature)

```text
specs/050-latex-onboarding-tooltip/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output (minimal — no DB)
├── quickstart.md        # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
src/
├── components/
│   ├── editor/
│   │   ├── editor-toolbar.tsx         # MODIFY — add LaTeX icon + popover
│   │   ├── editor-toolbar.test.tsx    # MODIFY — add tests for new button
│   │   └── latex-onboarding.tsx       # NEW — popover component
│   └── ui/
│       └── (existing shadcn components)
├── hooks/
│   └── use-local-dismissal.ts         # NEW — localStorage read/write hook
└── lib/
    └── editor/
        └── math-extension.ts          # EXISTING — :{ trigger (no changes)

public/
└── images/
    └── latex-before-after.svg         # NEW — illustration for popover

e2e/
└── latex-onboarding.spec.ts           # NEW — E2E tests
```

**Structure Decision**: Follows existing project layout. New component in `editor/`, new hook in `hooks/`, static asset in `public/images/`.
