# Research: LaTeX Onboarding Tooltip

**Feature**: 050-latex-onboarding-tooltip
**Date**: 2026-06-04

## R1: Popover Component Approach

**Decision**: Build a custom popover using existing patterns from the codebase (see `HighlightButton` in `editor-toolbar.tsx`) rather than adding a new shadcn/ui Popover dependency.

**Rationale**: The toolbar already has a working pattern for dropdown popovers (the highlight color picker uses `useState` + `useEffect` for outside-click detection + absolute positioning). Reusing this pattern keeps the implementation consistent and avoids adding a new Radix primitive just for one popover.

**Alternatives considered**:

- **shadcn/ui Popover (Radix)**: Would work well but adds a new dependency for a single use case. The existing codebase doesn't use Popover anywhere.
- **Native HTML `<dialog>`**: Overkill for a small tooltip-like popover. Doesn't position relative to a trigger element easily.

## R2: localStorage Key & Hook

**Decision**: Create a lightweight `use-local-dismissal` hook that reads/writes a boolean flag to localStorage under the key `typenote:latex-onboarding-dismissed`.

**Rationale**: A reusable hook keeps the toolbar component clean. The namespaced key (`typenote:` prefix) avoids collisions. Reading on mount with a `useState` initializer prevents flash-of-content issues.

**Alternatives considered**:

- **Inline localStorage calls**: Simpler but clutters the toolbar component. A hook is cleaner and testable.
- **Server-side persistence (user profile)**: Overkill for a UI preference. Adds latency and complexity. The spec explicitly says localStorage.

## R3: Illustration Approach

**Decision**: Use an inline SVG file (`public/images/latex-before-after.svg`) showing a before/after example — e.g., typed text `x^2 + y^2 = r^2` on the left, rendered equation on the right.

**Rationale**: SVG is resolution-independent, lightweight, and can match the app's theme. A static bundled asset avoids external fetches and works offline.

**Alternatives considered**:

- **PNG screenshot**: Fixed resolution, larger file, doesn't adapt to dark/light theme.
- **Live KaTeX render in popover**: More dynamic but adds complexity. A static illustration is sufficient for a "feature nudge."
- **CSS-only illustration**: Limited in what it can show. An SVG gives full control over the before/after visual.

## R4: Popover Content Copy

**Decision**: Use short, action-oriented copy:

- **Heading**: "Math made easy"
- **Body**: "Type `:{` to instantly convert text into beautiful equations"
- **Visual**: Before/after SVG illustration

**Rationale**: The spec requires 1-2 sentences max, action-oriented, motivating. This copy tells the user exactly what to do (type `:{`) and what they get (beautiful equations). The heading adds personality without being wordy.

## R5: Toolbar Icon Choice

**Decision**: Use the Lucide `Sigma` icon (mathematical sigma symbol, commonly associated with math/equations).

**Rationale**: Sigma (Σ) is universally recognized as a math symbol. Lucide already provides it, so no new icon library is needed. It's consistent with the rest of the toolbar which uses Lucide icons.

**Alternatives considered**:

- **Custom LaTeX logo SVG**: More specific but requires a custom asset and may not be recognizable at small sizes.
- **`Pi` icon**: Less universally associated with "math equations" than sigma.
- **`Calculator` icon**: Too generic, suggests arithmetic rather than equation typesetting.
