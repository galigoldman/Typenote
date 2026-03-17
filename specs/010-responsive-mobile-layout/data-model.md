# Data Model: 010-responsive-mobile-layout

**Date**: 2026-03-17

## Database Changes

**None.** This feature is purely a client-side UI/UX change. No database migrations, tables, columns, or RPC functions are needed.

## Client-Side State

### Sidebar Preference (localStorage)

| Key                          | Type    | Default | Description                                         |
| ---------------------------- | ------- | ------- | --------------------------------------------------- |
| `typenote-sidebar-collapsed` | boolean | `false` | Whether the user has manually collapsed the sidebar |

**Read on**: Component mount (initial sidebar state on desktop)
**Written on**: User toggles sidebar on desktop (manual open/close)
**Ignored when**: Viewport is <768px (mobile always starts with sidebar hidden)

### Runtime State (React)

| State         | Type      | Scope          | Description                                                                      |
| ------------- | --------- | -------------- | -------------------------------------------------------------------------------- |
| `isOpen`      | `boolean` | SidebarContext | Whether sidebar is currently visible                                             |
| `isMobile`    | `boolean` | SidebarContext | Derived from `useMediaQuery('(min-width: 768px)')` — `true` when viewport <768px |
| `isSheetOpen` | `boolean` | SidebarLayout  | Controls the Sheet overlay open/close on mobile                                  |
| `isChatOpen`  | `boolean` | AiChatWrapper  | Existing state — whether AI chat panel is visible                                |

### State Interactions

```
Viewport ≥ 768px (Desktop):
  isOpen = localStorage preference (default: true)
  Sidebar renders as inline <aside> (existing behavior)
  Toggle button updates isOpen + localStorage

Viewport < 768px (Mobile):
  isOpen = false (always hidden initially)
  Sidebar renders inside <Sheet> component
  Hamburger button opens Sheet (isSheetOpen = true)
  Navigation closes Sheet automatically
  Swipe gesture opens/closes Sheet
  localStorage preference is ignored
```

## New Components

| Component        | Type | Location                        | Purpose                         |
| ---------------- | ---- | ------------------------------- | ------------------------------- |
| `useMediaQuery`  | Hook | `src/hooks/use-media-query.ts`  | Detects viewport breakpoint     |
| `useSwipeDrawer` | Hook | `src/hooks/use-swipe-drawer.ts` | Detects left-edge swipe gesture |

## Modified Components

| Component           | File                                                        | Changes                                                                                                                                      |
| ------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `SidebarLayout`     | `src/components/dashboard/sidebar-layout.tsx`               | Add responsive rendering: inline aside (desktop) vs. Sheet (mobile). Add hamburger button. Integrate swipe gesture. Persist to localStorage. |
| `SidebarFolderTree` | `src/components/dashboard/sidebar-folder-tree.tsx`          | Increase touch target sizes (padding). Close sidebar on navigation (mobile).                                                                 |
| `DashboardLayout`   | `src/app/(dashboard)/layout.tsx`                            | Pass hamburger button to mobile header area.                                                                                                 |
| `AiChatPanel`       | `src/components/ai/ai-chat-panel.tsx`                       | Make width responsive: `w-full md:w-[420px]`.                                                                                                |
| `DocumentPage`      | `src/app/(dashboard)/dashboard/documents/[docId]/page.tsx`  | Ensure back breadcrumb is touch-friendly on mobile.                                                                                          |
| `CoursePage`        | `src/app/(dashboard)/dashboard/courses/[courseId]/page.tsx` | Add dashboard breadcrumb. Ensure week sections are collapsible with adequate touch targets.                                                  |
| `CanvasEditor`      | `src/components/canvas/canvas-editor.tsx`                   | Increase toolbar button touch targets.                                                                                                       |
| `WeekSection`       | `src/components/dashboard/week-section.tsx`                 | Increase touch targets for expand/collapse.                                                                                                  |
