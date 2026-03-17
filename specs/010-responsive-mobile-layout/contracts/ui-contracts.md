# UI Contracts: Responsive Mobile Layout

**Feature**: 010-responsive-mobile-layout
**Date**: 2026-03-17

## Contract 1: SidebarContext API

The sidebar context provides state and controls for the sidebar across the application.

### Current Interface

```ts
interface SidebarContextValue {
  isOpen: boolean;
  toggle: () => void;
}
```

### New Interface

```ts
interface SidebarContextValue {
  isOpen: boolean;
  isMobile: boolean;
  toggle: () => void;
  close: () => void;
}
```

| Field      | Type         | Description                                                       |
| ---------- | ------------ | ----------------------------------------------------------------- |
| `isOpen`   | `boolean`    | Whether the sidebar is currently visible (inline or overlay)      |
| `isMobile` | `boolean`    | `true` when viewport < 768px — consumers can adapt UI accordingly |
| `toggle`   | `() => void` | Toggles sidebar open/close                                        |
| `close`    | `() => void` | Closes the sidebar (used after navigation on mobile)              |

**Breaking change**: None — existing consumers use `isOpen` and `toggle`, both preserved. `isMobile` and `close` are additive.

---

## Contract 2: useMediaQuery Hook

### Signature

```ts
function useMediaQuery(query: string): boolean;
```

### Behavior

- Returns `true` when the CSS media query matches
- Updates reactively when the viewport changes (resize, rotation)
- Uses `window.matchMedia` with an event listener
- Returns `false` during SSR (safe default for server rendering)

### Usage

```ts
const isDesktop = useMediaQuery('(min-width: 768px)');
const isMobile = !isDesktop;
```

---

## Contract 3: useSwipeDrawer Hook

### Signature

```ts
interface UseSwipeDrawerOptions {
  edgeWidth?: number; // Default: 20 (pixels from left edge)
  threshold?: number; // Default: 50 (minimum swipe distance in px)
  onOpen: () => void;
  onClose: () => void;
  isOpen: boolean;
  enabled?: boolean; // Default: true — set false to disable
}

function useSwipeDrawer(
  ref: React.RefObject<HTMLElement>,
  options: UseSwipeDrawerOptions,
): void;
```

### Behavior

- **Open gesture**: Detects `touchstart` within `edgeWidth` px of the left screen edge, followed by a `touchmove` rightward exceeding `threshold` px
- **Close gesture**: When `isOpen` is true, detects a leftward swipe exceeding `threshold` px
- **Constraints**: Only activates on touch input (not mouse). Does not call `preventDefault()` on vertical-dominant swipes (allows normal scrolling).
- **Disabled**: When `enabled` is `false`, no event listeners are attached

---

## Contract 4: Responsive Sidebar Rendering

### Desktop (≥768px)

```
┌──────────────────────────────────────────────────┐
│  ┌─────────┐  ┌──────────────────────────────┐   │
│  │ Sidebar  │  │ Main Content                 │   │
│  │ (250px)  │  │ (flex-1)                     │   │
│  │ inline   │  │                              │   │
│  │ <aside>  │  │                              │   │
│  └─────────┘  └──────────────────────────────┘   │
└──────────────────────────────────────────────────┘
Toggle: PanelLeftOpen/Close button in canvas header (existing)
```

### Mobile (<768px)

```
┌──────────────────────┐
│ [☰] Typenote         │  ← Hamburger + logo header
├──────────────────────┤
│                      │
│   Main Content       │
│   (full width)       │
│                      │
│                      │
└──────────────────────┘

When sidebar open:
┌──────────────────────┐
│ ┌────────┐           │
│ │Sidebar │  Dimmed   │
│ │Sheet   │  backdrop │
│ │(280px) │           │
│ │overlay │           │
│ └────────┘           │
└──────────────────────┘
```

### Transition Behavior

- When viewport crosses 768px boundary:
  - **Desktop → Mobile**: Inline sidebar disappears, hamburger button appears. If sidebar was open, it closes (does not become Sheet).
  - **Mobile → Desktop**: Sheet closes if open, inline sidebar appears based on localStorage preference.

---

## Contract 5: AI Chat Panel Responsive Layout

### Desktop (≥768px)

```
┌──────────────────────────────────────────────────┐
│                              ┌─────────────────┐ │
│  Canvas Editor               │ AI Chat Panel   │ │
│  (behind overlay)            │ fixed right-0    │ │
│                              │ w-[420px]        │ │
│                              │ h-full           │ │
│                              └─────────────────┘ │
└──────────────────────────────────────────────────┘
```

### Mobile (<768px)

```
┌──────────────────────┐
│ AI Chat Panel        │
│ fixed inset-0        │
│ w-full h-full        │
│ z-50                 │
│                      │
│ ┌──────────────────┐ │
│ │ Input field      │ │
│ └──────────────────┘ │
└──────────────────────┘
```

---

## Contract 6: Touch Target Minimums

All interactive elements must meet these size requirements:

| Element Type               | Minimum Size | Current Size (approx) | Change Required |
| -------------------------- | ------------ | --------------------- | --------------- |
| Sidebar nav items          | 44px height  | ~32px (py-1.5)        | Yes             |
| Canvas toolbar buttons     | 44x44px      | ~32x32px              | Yes             |
| Hamburger menu button      | 44x44px      | N/A (new)             | New element     |
| AI chat send button        | 44x44px      | ~36x36px              | Minor           |
| Week section expand toggle | 44px height  | ~32px                 | Yes             |
| Sign out button            | 44px height  | ~36px                 | Minor           |
| Dialog action buttons      | 44px height  | ~36px                 | Minor           |

**Implementation**: Use Tailwind classes `min-h-[44px]` and `min-w-[44px]` on interactive elements. Apply universally (not just mobile) for accessibility.
