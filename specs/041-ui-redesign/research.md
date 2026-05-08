# Research: UI Redesign

## Decision 1: Color Scheme Delta

**Decision**: The primary purple color is already in place (`oklch(0.46 0.2 280)`). The main changes needed are warmer background tones and sidebar background.

**Rationale**: Current background is `oklch(0.985 0.002 293)` (cool near-white). Mockup shows warm gray/cream. Sidebar needs a slightly darker beige tone. This is a CSS variable update, not a component rewrite.

**Current values**:

- `--background`: `oklch(0.985 0.002 293)` (cool white)
- `--sidebar`: `oklch(0.95 0.01 293)` (if it exists, or derived from bg)
- `--card`: `oklch(1 0 0)` (pure white)

**Target values** (approximate to match mockup):

- `--background`: Warm off-white (shift hue toward cream ~60-80)
- Sidebar bg: Slightly darker cream/beige
- `--card`: Keep white for card contrast

## Decision 2: AI Panel — Already "AI Tutor"

**Decision**: The AI panel header already shows "AI Tutor" with a Sparkles icon in `#6355C0`. The Quick/Deep toggle already exists. Only missing: "AI ASSISTANT"/"YOU" labels on messages, and teal/green user message bubbles.

**Rationale**: Current user messages use `bg-primary` (purple). Mockup shows teal/green. Current messages have no role labels. These are small CSS class and text additions.

**Alternatives considered**: Keeping purple user messages — rejected because mockup explicitly shows green/teal.

## Decision 3: Course Cards — Inline vs Elevated

**Decision**: Current course cards are styled as inline list items (`rounded-lg border p-4`) not elevated cards. Mockup shows them as white elevated cards with shadows. Need to wrap them in the `Card` component or add equivalent styling.

**Rationale**: The `Card` component already provides `rounded-xl border bg-card shadow-sm`. Course cards just need to use it.

## Decision 4: Document Card Top Borders

**Decision**: Add colored top border bars to document cards using the existing `SUBJECT_COLORS` mapping. This is a CSS-only addition (no new data).

**Rationale**: The subject/course color data already exists. A 4px colored top border can be derived from the existing subject color. No schema changes needed.

## Decision 5: Course Breadcrumb → Pill Badge

**Decision**: The existing course breadcrumb link on document pages (`rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary`) needs to be restyled as an uppercase green pill to match the mockup.

**Rationale**: The element already exists and is functional. Only the CSS classes change.

## Decision 6: Moodle Prompt Restyling

**Decision**: The existing Moodle sync prompt uses a standard `Card`. Restyle it with a more prominent banner appearance — larger padding, icon, and a prominent purple button matching the mockup's "Install Extension" style.

**Rationale**: The component and functionality exist. This is a CSS/layout change within the existing component.

## Decision 7: Sidebar Styling

**Decision**: Keep the existing folder tree sidebar. Update background color to cream/beige, restyle the logo area with purple branding, update hover states and active item highlighting.

**Rationale**: User explicitly requested keeping the folder tree. Only visual updates needed.

## Decision 8: What NOT to Change

Per user clarification, these mockup elements are skipped (don't exist in current codebase):

- Search bar on dashboard
- FAB (floating action button)
- Starred documents toggle
- Notification bell
- Settings/Help sidebar icons
- User avatar in sidebar
- Key Insight cards in AI
- Quick action chips below AI input
- Welcome message with user name
