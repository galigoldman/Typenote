# Data Model: UI Redesign

## No Schema Changes Required

This feature is purely a visual restyling. No database tables, columns, or migrations are needed.

## Existing Data Used for Styling

### Course Color

- **Table**: `courses`
- **Field**: `color` (string, hex color value)
- **Used for**: Course card icon backgrounds, document card top border bars

### Document Subject

- **Table**: `documents`
- **Fields**: `subject` (enum-like string), `subject_custom` (optional string)
- **Used for**: Document card subject badges, document card top border color mapping via `SUBJECT_COLORS` in `document-card.tsx`

### Document Timestamps

- **Table**: `documents`
- **Field**: `updated_at` (timestamp)
- **Used for**: "Last edited" relative time display (already rendered via `getRelativeTime()`)

## Color Mappings (Existing)

The `SUBJECT_COLORS` mapping in `document-card.tsx` provides per-subject badge colors:

- calculus → blue
- linear_algebra → purple
- discrete_math → green
- logic → yellow
- data_structures → orange
- algorithms → red
- physics → cyan
- other → gray

These same colors will be used for document card top border bars.
