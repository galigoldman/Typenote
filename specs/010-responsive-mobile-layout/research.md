# Research: 010-responsive-mobile-layout

**Date**: 2026-03-17

## Decision 1: Mobile Sidebar Component — shadcn/ui Sheet vs. Custom Drawer

**Decision**: Use the **shadcn/ui Sheet component** (Radix Dialog-based) for the mobile sidebar overlay. Install via `npx shadcn@latest add sheet`.

**Rationale**:

- The Sheet component provides an accessible, portal-based side panel with backdrop, keyboard dismissal, and focus trapping — all required for a mobile drawer
- shadcn/ui is already the project's UI library (components.json configured, 15+ components installed). Sheet follows the same patterns (cn(), data-slot attributes, Radix primitives)
- Sheet supports `side="left"` for a sidebar overlay — exactly the use case
- Built-in animation (slide in/out) matches the spec's "smooth animated transitions" requirement (FR-014)
- No need for a custom drawer implementation when a battle-tested component exists

**Alternatives considered**:

- **Custom drawer with CSS transitions**: Full control, no new dependency. Rejected — would need to manually implement backdrop, focus trap, scroll lock, portal rendering, and keyboard dismissal. Sheet already handles all of this.
- **Vaul (drawer library)**: Popular for bottom sheets, supports side drawers. Rejected — adds an external dependency when shadcn/ui Sheet already covers the need.
- **CSS-only responsive sidebar (no overlay)**: Push content aside instead of overlay. Rejected — on small screens, a 250px sidebar pushing content leaves too little space for the editor.

## Decision 2: Responsive Breakpoint Detection — CSS-Only vs. JavaScript Hook

**Decision**: Use a **hybrid approach**: CSS Tailwind breakpoints (`md:`) for layout styling, plus a lightweight `useMediaQuery` custom hook for JavaScript-level behavior switching (e.g., deciding whether to render Sheet vs. inline sidebar).

**Rationale**:

- The sidebar component needs to render fundamentally different markup on mobile (Sheet overlay) vs. desktop (inline aside) — this cannot be done with CSS alone
- Tailwind's `md:` breakpoint (768px) matches the spec's breakpoint requirement (FR-001)
- A `useMediaQuery('(min-width: 768px)')` hook is ~15 lines, no library needed
- The project already uses Tailwind responsive classes (`sm:grid-cols-2`, `md:grid-cols-3`) for layout — CSS handles styling, JS handles component structure
- No existing `useMediaQuery` hook exists in the project

**Alternatives considered**:

- **CSS-only (no JS hook)**: Render both mobile and desktop markup, toggle visibility with Tailwind classes. Rejected — renders unnecessary DOM nodes, Sheet component would mount/unmount portals even when hidden, and swipe gesture logic needs JS awareness of the current mode.
- **react-responsive library**: Full-featured responsive hooks. Rejected — overkill for a single breakpoint check. A custom hook is simpler and dependency-free.
- **ResizeObserver-based detection**: Watch container width instead of viewport. Rejected — viewport width is the correct signal for mobile layout decisions.

## Decision 3: Swipe Gesture Implementation — Custom Touch Handler vs. Gesture Library

**Decision**: Implement swipe detection as a **custom React hook** (`useSwipeDrawer`) using native Touch Events, following the project's existing pattern.

**Rationale**:

- The project already uses native Touch Events and Pointer Events extensively (canvas-page.tsx touchmove handlers, use-pinch-zoom.ts, use-drawing.ts)
- The existing architecture cleanly separates input by `pointerType` (pen → drawing, touch → scroll/gestures, mouse → selection). Swipe detection fits naturally into the touch input channel
- The swipe gesture is simple: detect horizontal swipe starting within 20px of the left edge. This doesn't justify adding a gesture library
- Canvas page already has `touchstart`/`touchmove` handlers with `{ passive: false }` — the swipe detector can coexist at a higher level (sidebar layout, not canvas)
- The gesture only needs to work on touch input (FR-009), which is already discriminated by the canvas code

**Alternatives considered**:

- **Hammer.js / use-gesture library**: Full-featured gesture recognition. Rejected — adds a dependency for one simple swipe gesture. The project has zero gesture library dependencies and relies on native events.
- **Pointer Events instead of Touch Events**: Unified input API. Rejected — Touch Events are more appropriate here because: (1) the canvas code already separates pen from touch via pointerType, (2) swipe gestures are inherently multi-touch-aware, and (3) the existing canvas scroll handler already uses Touch Events.
- **CSS touch-action property only**: Prevent default browser gestures. Not a full solution — still need JS to detect the swipe direction and trigger sidebar open/close.

**Coexistence strategy**:

- Swipe detection hooks into `touchstart`/`touchmove`/`touchend` at the **sidebar layout level** (parent of both sidebar and main content)
- The touch zone is limited to the leftmost 20px of the viewport — canvas drawing happens well inside the content area
- When the sidebar overlay is open, swipe-left anywhere on the sidebar closes it
- The canvas's existing touch handlers (scroll, pinch-zoom) are on the canvas element, not the layout — no event conflict

## Decision 4: Sidebar State Persistence — localStorage vs. Cookie vs. Server

**Decision**: Use **localStorage** with a simple key (`typenote-sidebar-collapsed`) storing a boolean.

**Rationale**:

- Sidebar preference is a cosmetic UI preference, not user data — no need for server storage
- localStorage is synchronous and available immediately on page load — no flash of wrong state
- The existing `createSidebarStore` in sidebar-layout.tsx can be extended to read/write localStorage
- No authentication required to read the preference (it's per-browser, not per-user)
- The spec explicitly suggests localStorage (Assumptions section)

**Alternatives considered**:

- **Cookie**: Available server-side for SSR initial render. Rejected — sidebar layout is a client component (`'use client'`), so SSR doesn't render the sidebar anyway. Cookie adds unnecessary complexity.
- **Supabase `profiles` table**: Per-user preference, syncs across devices. Rejected — overkill for a sidebar toggle. Adds a database call to every page load. Can add later if multi-device sync is requested.
- **CSS `prefers-reduced-motion` only**: Respect system preferences. Not a persistence mechanism — complements but doesn't replace localStorage.

## Decision 5: Mobile AI Chat Panel — Bottom Sheet vs. Full-Screen Overlay

**Decision**: Use a **full-screen overlay** for the AI chat panel on mobile (<768px), implemented by making the existing fixed panel responsive (change `w-[420px]` to `w-full` on mobile).

**Rationale**:

- The AI chat panel is already a fixed overlay (`fixed right-0 top-0 z-50 h-full w-[420px]`). Making it full-width on mobile is a minimal change
- A bottom sheet would require the Vaul library or significant custom implementation — the existing panel structure (header, messages, input) maps better to a full-screen overlay
- Full-screen overlay ensures the input field is always visible and the keyboard doesn't obscure messages
- The panel already has a close button — adding swipe-down-to-dismiss is straightforward

**Alternatives considered**:

- **Bottom sheet (Vaul)**: Familiar mobile pattern (WhatsApp, iMessage). Rejected — adds a dependency, requires restructuring the panel, and the chat messages list works better in a tall vertical layout than a short bottom sheet.
- **Inline panel below canvas**: No overlay, push content. Rejected — on mobile, this would split the already-small screen into two unusable halves.
- **Separate page/route for chat on mobile**: Navigate to a dedicated chat page. Rejected — loses the document context, breaks the current architecture where chat reads document content via ref.

## Decision 6: Back Navigation — Breadcrumbs vs. Back Button

**Decision**: Use **breadcrumb-style links** (already partially implemented on document pages) and ensure they're present and touch-friendly on all nested pages.

**Rationale**:

- Document pages already have a course breadcrumb link (`<Link href={/dashboard/courses/${course.id}}>`). This pattern needs to be extended and made mobile-friendly.
- Breadcrumbs show context (where am I?) in addition to providing navigation — more informative than a bare back arrow
- The project already has a `breadcrumb` shadcn/ui component installed
- On mobile, the breadcrumb doubles as the primary navigation since the sidebar is hidden

**Alternatives considered**:

- **Browser back button only**: Zero implementation effort. Rejected — unreliable when users open links in new tabs or navigate non-linearly. The spec requires explicit in-app back navigation (FR-019, FR-020).
- **Custom back button (arrow icon)**: Simpler than breadcrumbs. Rejected — doesn't provide path context. A breadcrumb link like "← Linear Algebra" is more useful than just "← Back".

## Decision 7: Touch Target Sizing — CSS Padding vs. Component Restructuring

**Decision**: Use **CSS-only adjustments** (increased padding, min-height) within existing components, applied conditionally via Tailwind responsive classes or universally where it doesn't harm desktop aesthetics.

**Rationale**:

- The current sidebar items use `py-1.5` (24px height) — increasing to `py-2.5` or `py-3` on mobile gets close to 44px without restructuring
- Toolbar buttons in the canvas editor can use `min-h-[44px] min-w-[44px]` classes
- Most touch target issues are spacing problems, not structural problems — CSS fixes are sufficient
- Universal 44px minimums are an accessibility improvement on desktop too (easier to click)

**Alternatives considered**:

- **Separate mobile component variants**: Different components for mobile and desktop. Rejected — doubles maintenance burden for a spacing concern. Responsive CSS classes handle this cleanly.
- **Touch-only media query (`@media (pointer: coarse)`)**: Apply larger targets only on touch devices. Considered as a complement — Tailwind doesn't have a built-in `coarse` variant, but a custom one could be added. For now, making targets 44px universally is simpler and improves accessibility for all users.
