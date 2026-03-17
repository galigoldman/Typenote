# Implementation Plan: Responsive Mobile/Tablet Layout

**Branch**: `010-responsive-mobile-layout` | **Date**: 2026-03-17 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/010-responsive-mobile-layout/spec.md`

## Summary

Make Typenote fully usable on phones and tablets. The 250px fixed sidebar becomes a Sheet-based overlay on screens <768px, triggered by a hamburger menu button or a left-edge swipe gesture. All interactive elements are enlarged to 44px minimum touch targets. The AI chat panel goes full-screen on mobile. Breadcrumb navigation is added to course and document pages for easy back-navigation. The sidebar collapse preference persists via localStorage on desktop.

## Technical Context

**Language/Version**: TypeScript 5 / Node.js 22+ + Next.js 16 (App Router)
**Primary Dependencies**: React 19, shadcn/ui (Sheet — new), Tailwind CSS 4, Radix UI
**Storage**: localStorage (sidebar preference only — no database changes)
**Testing**: Vitest (unit), React Testing Library (component), manual device testing
**Target Platform**: Web — responsive for phones (375px+), tablets (768px+), desktop (1024px+)
**Project Type**: Web application (full-stack, client-side UI changes only)
**Performance Goals**: Layout transitions complete in <200ms; no layout shift on page load
**Constraints**: Must not break canvas drawing, text editing, or existing desktop UX
**New Dependencies**: shadcn/ui Sheet component (uses already-installed @radix-ui/react-dialog)

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

### Pre-Phase 0 Check

| Principle                       | Status | Notes                                                                                                         |
| ------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------- |
| I. Incremental Development      | PASS   | Hooks first → Sheet install → responsive sidebar → touch targets → AI panel → navigation. Each step testable. |
| II. Test-Driven Quality         | PASS   | Unit tests for hooks, component tests for responsive rendering, manual device testing for gestures.           |
| III. Protected Main Branch      | PASS   | Working on `010-responsive-mobile-layout` branch. Will PR to main.                                            |
| IV. Migrations as Code          | N/A    | No database changes in this feature.                                                                          |
| V. Interview-Ready Architecture | PASS   | Responsive design patterns, touch event architecture, component polymorphism — all documented in quickstart.  |

### Post-Phase 1 Check

| Principle                       | Status | Notes                                                                                                             |
| ------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------- |
| I. Incremental Development      | PASS   | 7 phases, each producing a working increment. Hooks are independent. Sidebar refactor doesn't touch AI or canvas. |
| II. Test-Driven Quality         | PASS   | Unit tests for both hooks. Component tests for sidebar rendering modes. Manual testing checklist for devices.     |
| IV. Migrations as Code          | N/A    | No database changes.                                                                                              |
| V. Interview-Ready Architecture | PASS   | Hybrid CSS/JS responsive approach, touch event coexistence, localStorage persistence — all interview-ready.       |

## Project Structure

### Documentation (this feature)

```text
specs/010-responsive-mobile-layout/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 output — technology decisions
├── data-model.md        # Phase 1 output — state model (no DB changes)
├── quickstart.md        # Phase 1 output — development guide
├── contracts/           # Phase 1 output — interface contracts
│   └── ui-contracts.md  # UI component contracts
└── checklists/
    └── requirements.md  # Spec quality checklist
```

### Source Code (repository root)

```text
src/
├── hooks/
│   ├── use-media-query.ts          # NEW — reactive CSS media query hook
│   └── use-swipe-drawer.ts         # NEW — left-edge swipe gesture detection
├── components/
│   ├── ui/
│   │   └── sheet.tsx               # NEW — shadcn/ui Sheet component (installed via CLI)
│   ├── dashboard/
│   │   ├── sidebar-layout.tsx      # MODIFIED — responsive desktop/mobile rendering
│   │   ├── sidebar-folder-tree.tsx # MODIFIED — touch targets, close-on-navigate
│   │   └── week-section.tsx        # MODIFIED — touch target increase
│   ├── canvas/
│   │   └── canvas-editor.tsx       # MODIFIED — toolbar touch targets
│   └── ai/
│       └── ai-chat-panel.tsx       # MODIFIED — responsive width
├── app/(dashboard)/
│   ├── layout.tsx                  # MODIFIED — mobile header with hamburger
│   └── dashboard/
│       ├── courses/[courseId]/
│       │   └── page.tsx            # MODIFIED — dashboard breadcrumb
│       └── documents/[docId]/
│           └── page.tsx            # MODIFIED — touch-friendly breadcrumb

tests/
├── src/hooks/
│   ├── use-media-query.test.ts     # NEW — unit tests
│   └── use-swipe-drawer.test.ts    # NEW — unit tests
└── src/components/dashboard/
    └── sidebar-layout.test.tsx     # NEW — responsive rendering tests
```

**Structure Decision**: Two new hooks, one new UI component (Sheet via CLI), modifications to 8 existing files. No new pages, routes, or database changes. The responsive logic is centralized in `SidebarLayout` — other components receive behavior via the extended `SidebarContext`.

## Implementation Phases

### Phase 1: Utility Hooks (Foundation)

**Goal**: Create the two hooks that the responsive sidebar depends on.

1. Create `src/hooks/use-media-query.ts`:
   - Accept a CSS media query string (e.g., `'(min-width: 768px)'`)
   - Use `window.matchMedia` with `addEventListener('change', ...)`
   - Return `false` during SSR / initial render (safe default)
   - Clean up listener on unmount

2. Create `src/hooks/use-swipe-drawer.ts`:
   - Accept a ref to the container element and options (edgeWidth, threshold, onOpen, onClose, isOpen, enabled)
   - Attach `touchstart`, `touchmove`, `touchend` listeners to the container
   - Detect swipe-right from left edge (within `edgeWidth` px) → call `onOpen`
   - Detect swipe-left when `isOpen` → call `onClose`
   - Ignore vertical-dominant gestures (allow normal scrolling)
   - Only activate on touch input; no-op if `enabled` is false

**Test**: Unit tests for both hooks:

- `useMediaQuery`: matches/doesn't match, updates on change event, returns false on SSR
- `useSwipeDrawer`: fires onOpen on right swipe from left edge, fires onClose on left swipe when open, ignores vertical swipes, ignores swipes from middle of screen, respects enabled flag

### Phase 2: Sheet Component Installation

**Goal**: Add the shadcn/ui Sheet component to the project.

1. Run `npx shadcn@latest add sheet`
   - This installs `src/components/ui/sheet.tsx`
   - Uses the already-installed `@radix-ui/react-dialog` under the hood
   - Verify it follows the project's component patterns (cn(), data-slot, etc.)

**Test**: Verify the component renders without errors in a simple test.

### Phase 3: Responsive Sidebar (Core)

**Goal**: Refactor `SidebarLayout` to render differently on mobile vs. desktop.

1. Modify `src/components/dashboard/sidebar-layout.tsx`:
   - Import `useMediaQuery` hook — derive `isMobile` from `!useMediaQuery('(min-width: 768px)')`
   - **Desktop path** (≥768px): Keep existing inline `<aside>` rendering
     - On mount, read `localStorage.getItem('typenote-sidebar-collapsed')` to set initial state
     - On toggle, write to localStorage
   - **Mobile path** (<768px): Render sidebar content inside `<Sheet side="left">`
     - Sheet open state controlled by `isSheetOpen` (separate from desktop `isOpen`)
     - Hamburger button triggers `isSheetOpen = true`
   - Extend `SidebarContext` to include `isMobile` and `close()` method
   - Integrate `useSwipeDrawer` on the layout container ref

2. Modify `src/app/(dashboard)/layout.tsx`:
   - On mobile, render a header bar with the hamburger button and "Typenote" title
   - The hamburger button calls `toggle()` from SidebarContext
   - On desktop, keep the existing layout (logo in sidebar header)

3. Modify `src/components/dashboard/sidebar-folder-tree.tsx`:
   - Import `useSidebar` and check `isMobile`
   - After `router.push()` in FolderNode and CourseNode click handlers, call `close()` if `isMobile`
   - Increase padding on nav items: `py-1.5` → `py-2.5` for minimum 44px touch targets

**Test**: Component tests:

- SidebarLayout renders `<aside>` when `useMediaQuery` returns true (desktop)
- SidebarLayout renders Sheet when `useMediaQuery` returns false (mobile)
- Hamburger button visible on mobile, hidden on desktop
- localStorage is read on mount and written on toggle (desktop only)
- Navigation on mobile triggers sidebar close

### Phase 4: Touch Target Sizing

**Goal**: Ensure all interactive elements meet 44px minimum touch targets.

1. Modify `src/components/canvas/canvas-editor.tsx`:
   - Toolbar buttons: add `min-h-[44px] min-w-[44px]` classes
   - Ensure icon buttons have adequate padding

2. Modify `src/components/dashboard/week-section.tsx`:
   - Week header row: increase to minimum 44px height
   - Expand/collapse chevron: increase tappable area

3. Review and adjust across existing components:
   - Sign-out button in dashboard layout: already adequate (Button component)
   - Dialog buttons: already adequate (shadcn Button)
   - AI chat send button: verify and adjust if needed

**Test**: Visual inspection on mobile device/emulator. Verify each interactive element is at least 44x44px.

### Phase 5: Responsive AI Chat Panel

**Goal**: Make the AI chat panel full-screen on mobile.

1. Modify `src/components/ai/ai-chat-panel.tsx`:
   - Change width class: `w-[420px]` → `w-full md:w-[420px]`
   - On mobile, the panel already uses `fixed inset-0 z-50` effectively (right-0 top-0 h-full with w-full = full screen)
   - Adjust any `right-0` positioning to work with `w-full`
   - Ensure input field stays above keyboard (existing `sticky bottom-0` or add if missing)

**Test**: Manual testing on mobile device — verify panel fills screen, keyboard doesn't obscure input.

### Phase 6: Back Navigation & Breadcrumbs

**Goal**: Add breadcrumb navigation for easy back-navigation on mobile.

1. Modify `src/app/(dashboard)/dashboard/courses/[courseId]/page.tsx`:
   - Add a breadcrumb link at top: "← Dashboard" linking to `/dashboard`
   - Use the existing `breadcrumb` shadcn/ui component or a simple styled link
   - Ensure touch target is 44px height

2. Modify `src/app/(dashboard)/dashboard/documents/[docId]/page.tsx`:
   - The course breadcrumb already exists — ensure it has adequate touch target size
   - Add padding/min-height for 44px touch target

3. Ensure week sections on course page remain collapsible (already implemented in `week-section.tsx` — just verify touch target from Phase 4)

**Test**: Navigate document → course → dashboard on mobile. Verify each transition is 1 tap. Verify breadcrumbs are easy to tap.

### Phase 7: Integration Testing & Polish

**Goal**: End-to-end verification across devices and edge cases.

1. Run full test suite (`pnpm test`) — verify no regressions
2. Run lint (`pnpm lint`) — verify no new lint errors
3. Manual testing checklist:
   - [ ] iPhone Safari (375px): sidebar overlay, swipe, canvas drawing, AI chat
   - [ ] Android Chrome (390px): same checks
   - [ ] iPad Safari portrait (768px): verify breakpoint transition
   - [ ] iPad Safari landscape (1024px): verify desktop behavior
   - [ ] Desktop Chrome: verify no changes to desktop experience
   - [ ] Orientation rotation: verify smooth transition
   - [ ] Rapid hamburger tapping: verify no stuck states
   - [ ] Long folder tree: verify sidebar scrolls independently
4. Write component test for `SidebarLayout` responsive rendering
5. Performance check: no layout shift (CLS = 0), transitions < 200ms

**Test**: Full test suite passes. Manual testing checklist complete.
