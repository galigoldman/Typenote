# Data Model: PDF Export Overhaul

**Branch**: `020-pdf-export-overhaul` | **Date**: 2026-03-23

## Overview

This feature introduces **no new database tables or schema changes** and **no new npm dependencies**. All data is read from existing entities. The only new asset is Hebrew font files in `/public/fonts/`.

## Existing Entities (Read-Only)

### Document

Source: `documents` table in Supabase

| Field       | Type          | Used for                                         |
| ----------- | ------------- | ------------------------------------------------ |
| title       | string        | Print window title + suggested filename          |
| content     | JSONB         | TipTap JSON → `generateHTML()` → print HTML      |
| pages       | JSONB \| null | Canvas page data → SVG strokes + HTML text boxes |
| canvas_type | string        | Default page background type                     |

### Canvas Page (within `pages` JSONB)

| Field       | Type          | Used for                                           |
| ----------- | ------------- | -------------------------------------------------- |
| strokes     | Stroke[]      | → `strokeToSvgPath()` → SVG `<path>` elements      |
| textBoxes   | TextBox[]     | → positioned HTML `<div>`s in print document       |
| flowContent | JSONB \| null | → `generateHTML()` → main page content             |
| pageType    | string        | → `renderBackgroundSvg()` → SVG background pattern |

## Intermediate Structure (In-Memory Only)

The export builds a single HTML string that is written to the print window:

```
TipTap JSON + Canvas Pages
         │
         ▼
    HTML Document String
    ├── <head>
    │   ├── @font-face (Geist Sans/Mono + Noto Sans Hebrew)
    │   ├── KaTeX CSS (inline or CDN link)
    │   ├── Tailwind prose typography CSS
    │   └── @page + @media print rules
    └── <body>
        ├── Canvas pages (if any):
        │   └── Per page: background SVG + stroke SVGs + text box divs
        └── Text content (if any):
            └── TipTap HTML with KaTeX-rendered math spans
```

No server-side processing. No API calls. No PDF library. The browser's native print engine converts this HTML to PDF.
