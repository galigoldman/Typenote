# Quickstart: 010-responsive-mobile-layout

## What This Feature Does

Makes Typenote usable on phones and tablets. The sidebar auto-collapses to a hamburger-triggered overlay on screens <768px. Swipe gestures open/close the sidebar on touch devices. All interactive elements meet 44px minimum touch targets. The AI chat panel goes full-screen on mobile. Back-navigation breadcrumbs appear on all nested pages.

## Architecture Overview

```
Viewport Check (useMediaQuery)
        ↓
  ┌──────────────┐
  │ ≥ 768px?     │
  │              │
  │  YES (desk)  │  NO (mobile)
  │  ↓           │  ↓
  │  Inline      │  Sheet overlay
  │  <aside>     │  + hamburger btn
  │  w-[250px]   │  + swipe gesture
  │  localStorage│
  └──────────────┘
        ↓
  Main content fills remaining/full width
        ↓
  Touch targets ≥ 44px everywhere
```

## Key Changes by Layer

### New Hooks

- **`src/hooks/use-media-query.ts`**: Reactive CSS media query hook. Returns boolean. Used by SidebarLayout to switch between desktop/mobile rendering.
- **`src/hooks/use-swipe-drawer.ts`**: Detects left-edge swipe gestures on touch devices. Opens/closes the sidebar overlay. Only active on mobile.

### New UI Component

- **shadcn/ui Sheet**: `npx shadcn@latest add sheet`. Used as the mobile sidebar overlay container. Provides backdrop, focus trap, keyboard dismissal, portal rendering.

### Modified Components

- **`sidebar-layout.tsx`** (major):
  - Desktop: existing inline `<aside>` with localStorage persistence
  - Mobile: `<Sheet side="left">` overlay with hamburger button
  - Extended SidebarContext: adds `isMobile` and `close()` to the context
  - Integrates `useSwipeDrawer` for touch gesture support

- **`sidebar-folder-tree.tsx`** (minor):
  - Increased padding on nav items for touch targets
  - Calls `close()` from SidebarContext after navigation on mobile

- **`layout.tsx` (dashboard)** (minor):
  - Mobile header bar with hamburger button and "Typenote" logo

- **`ai-chat-panel.tsx`** (minor):
  - Width: `w-full md:w-[420px]` (full screen on mobile, 420px on desktop)

- **`canvas-editor.tsx`** (minor):
  - Toolbar button touch targets increased to 44x44px

- **`week-section.tsx`** (minor):
  - Touch target increase on expand/collapse header

- **Document & Course pages** (minor):
  - Touch-friendly breadcrumb sizing
  - Dashboard back-link on course pages

### No Changes

- No database migrations
- No API route changes
- No new dependencies beyond shadcn/ui Sheet (which uses already-installed Radix)
- Canvas drawing, text editing, AI chat logic — all unchanged

## Development Order

1. **Hooks** — `useMediaQuery` + `useSwipeDrawer` (independent, no UI changes yet)
2. **Sheet installation** — `npx shadcn@latest add sheet`
3. **Responsive sidebar** — Refactor `SidebarLayout` to use Sheet on mobile, inline aside on desktop, localStorage persistence
4. **Touch targets** — Increase sizes across sidebar, toolbar, week sections
5. **Mobile AI chat** — Make chat panel full-width on mobile
6. **Back navigation** — Add breadcrumbs to course pages, ensure document breadcrumbs are touch-friendly
7. **Tests** — Unit tests for hooks, integration tests for responsive behavior

## Key Interview Concepts

- **Responsive design patterns**: CSS breakpoints vs. JS media queries — when you need each and why this feature uses both
- **Component composition**: Same SidebarContext API serving two fundamentally different renderings (inline vs. overlay) — polymorphism in UI
- **Touch event architecture**: How the existing Pointer Events separation (pen/touch/mouse) enables clean gesture coexistence
- **Progressive enhancement**: Desktop experience is unchanged; mobile experience is layered on top without degrading desktop
- **Accessibility**: 44px touch targets benefit all users (not just mobile) — universal design principle
- **State persistence**: localStorage for UI preferences vs. server-side for user data — choosing the right persistence layer for the data type

## Testing Strategy

### Unit Tests (Vitest + jsdom)

- `useMediaQuery`: Returns correct boolean for matching/non-matching queries, updates on change
- `useSwipeDrawer`: Fires onOpen/onClose callbacks based on simulated touch events, respects edge zone and threshold

### Component Tests (Vitest + React Testing Library)

- `SidebarLayout`: Renders hamburger button when viewport < 768px, renders inline aside when ≥ 768px
- `SidebarLayout`: localStorage is read on mount, written on toggle
- `SidebarFolderTree`: Calls `close()` on navigation when `isMobile` is true

### Manual Testing (required — automated viewport testing is brittle)

- Test on real iPhone (Safari), Android (Chrome), iPad (Safari)
- Verify swipe gesture opens/closes sidebar
- Verify canvas drawing near left edge doesn't trigger sidebar
- Verify AI chat panel fills screen on mobile
- Verify keyboard doesn't obscure chat input
- Verify orientation changes don't break layout
