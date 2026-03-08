# Feature Specification: iPad Optimization & Apple Pencil Support

## Overview

Transform Typenote into an iPad-optimized Progressive Web App (PWA) that supports Apple Pencil input for drawing, annotating, and handwriting on STEM notes. Users should be able to install Typenote on their iPad home screen and seamlessly work across iPad and desktop with real-time synchronization.

## Problem Statement

STEM students frequently switch between laptop and iPad during lectures and study sessions. Currently, Typenote is a desktop-focused web app with no touch optimization, no Apple Pencil support, and no ability to install as a standalone app on iPad. Students need to draw diagrams, annotate formulas, and sketch graphs — tasks that are natural with a stylus but impossible with the current text-only editor.

## User Scenarios & Acceptance Criteria

### Scenario 1: Installing Typenote on iPad

**As a** student,
**I want to** install Typenote on my iPad home screen,
**so that** it feels like a native app and I can access it quickly.

**Acceptance Criteria:**

- User can add Typenote to iPad home screen via Safari's "Add to Home Screen"
- App launches in standalone mode (no Safari browser chrome)
- App displays a proper icon and splash screen on launch
- App name appears as "Typenote" under the home screen icon

### Scenario 2: Touch-Optimized Interface

**As a** student using an iPad,
**I want** the interface to be comfortable for touch interaction,
**so that** I can navigate and use the app without a keyboard or mouse.

**Acceptance Criteria:**

- All interactive elements (buttons, cards, menus) have minimum 44x44pt touch targets
- Editor toolbar is accessible and usable via touch without precision clicking
- Navigation between dashboard and documents works smoothly with touch gestures
- Folder and document cards are easy to tap and manage on touch screens
- The app adapts its layout for tablet screen sizes (768px-1024px width range)

### Scenario 3: Drawing with Apple Pencil

**As a** student with an Apple Pencil,
**I want to** draw diagrams, graphs, and annotations directly in my notes,
**so that** I can visually explain STEM concepts alongside my typed text.

**Acceptance Criteria:**

- A dedicated drawing/canvas mode can be activated within a document
- Apple Pencil strokes are rendered in real-time with minimal latency
- Drawing supports variable stroke width based on pen pressure
- User can choose between at least 3 pen colors (black, blue, red) and an eraser tool
- Drawings are embedded inline within the document (between text blocks)
- Drawings persist when the document is saved and reloaded

### Scenario 4: Switching Between Typing and Drawing

**As a** student,
**I want to** seamlessly switch between typing text and drawing,
**so that** I can mix typed notes with hand-drawn content in a single document.

**Acceptance Criteria:**

- A clear toggle or mode switch exists between text editing and drawing mode
- In drawing mode, Apple Pencil input creates strokes (not text selection)
- In text mode, finger/touch input works normally for text editing
- Switching modes does not discard or corrupt existing content
- The document displays both text blocks and drawing blocks in a unified view

### Scenario 5: Cross-Device Real-Time Sync with Drawings

**As a** student,
**I want** my drawings to sync in real-time between iPad and desktop,
**so that** I can start drawing on iPad and continue editing text on my laptop.

**Acceptance Criteria:**

- Drawing data syncs between devices using the existing real-time sync infrastructure
- A drawing made on iPad appears on the desktop browser within 3 seconds
- The editing lock mechanism works correctly for both text and drawing changes
- No data loss occurs when switching between devices

### Scenario 6: Offline Access on iPad

**As a** student,
**I want** Typenote to work when my iPad loses internet connection,
**so that** I can continue taking notes during lectures in areas with poor connectivity.

**Acceptance Criteria:**

- Previously opened documents are available offline
- Users can view and edit documents without an internet connection
- Changes made offline sync automatically when the connection is restored
- A clear indicator shows the user when they are offline vs. online

## Functional Requirements

### PWA Installation (Mandatory)

- **FR-1**: The app must include a valid web app manifest with app name, icons (192x192 and 512x512), theme color, and display mode set to "standalone"
- **FR-2**: The app must register a service worker that caches essential assets (HTML, CSS, JS, fonts) for offline access
- **FR-3**: The app must serve all pages over HTTPS (required for PWA)
- **FR-4**: The app must include appropriate viewport meta tags for proper scaling on iPad

### Touch Optimization (Mandatory)

- **FR-5**: All interactive UI elements must meet the minimum 44x44pt touch target size guideline
- **FR-6**: The editor toolbar must reorganize for touch screens — larger buttons, appropriate spacing, and grouped actions
- **FR-7**: The app layout must be responsive for tablet screen sizes, utilizing available screen space without requiring horizontal scrolling
- **FR-8**: Touch interactions (tap, swipe, long-press) must feel responsive with appropriate visual feedback

### Apple Pencil Drawing (Mandatory)

- **FR-9**: The editor must support a "drawing block" node type that renders an inline canvas within the document
- **FR-10**: The drawing canvas must capture Apple Pencil input using the Pointer Events API, detecting pen vs. touch vs. mouse input types
- **FR-11**: Strokes must render in real-time using a performant rendering approach (e.g., Canvas 2D or SVG paths)
- **FR-12**: Pen pressure data must be used to vary stroke width for natural-feeling handwriting
- **FR-13**: A minimal drawing toolbar must provide: pen tool, eraser tool, color picker (minimum black/blue/red), and stroke width selector
- **FR-14**: Drawing data must be serialized into a format that can be stored in the existing document content structure
- **FR-15**: Completed strokes must be undoable/redoable, integrated with the editor's undo/redo history

### Mode Switching (Mandatory)

- **FR-16**: A visible toggle must allow users to switch between "Text Mode" and "Draw Mode"
- **FR-17**: In Draw Mode, Apple Pencil and finger input create drawing strokes
- **FR-18**: In Text Mode, all input behaves as standard text editing (selection, cursor, keyboard)
- **FR-19**: The active mode must be visually indicated at all times

### Drawing Sync (Mandatory)

- **FR-20**: Drawing block data must be included in the document's content payload that syncs via Supabase Realtime
- **FR-21**: Drawing updates must use the same sync mechanism and conflict resolution as text content
- **FR-22**: The editing lock must apply to both text and drawing modifications

### Offline Support (Mandatory)

- **FR-23**: The service worker must implement a cache-first strategy for app shell assets
- **FR-24**: Recently accessed documents must be cached locally for offline reading and editing
- **FR-25**: Offline edits must be queued and synced when connectivity returns
- **FR-26**: The UI must display a clear online/offline status indicator

## Non-Functional Requirements

- **NFR-1**: Apple Pencil stroke rendering latency must be under 16ms (60fps) to feel responsive
- **NFR-2**: Drawing blocks should support canvases up to 2048x2048 pixels without performance degradation
- **NFR-3**: The PWA must score 90+ on Lighthouse PWA audit
- **NFR-4**: The app must work on iPad Safari 16+ and desktop Chrome/Firefox/Safari latest versions
- **NFR-5**: Offline document cache must not exceed 50MB of local storage per user

## Key Entities

### Drawing Block

- **stroke_data**: Collection of strokes, each containing points with x, y, pressure, and timestamp
- **canvas_dimensions**: Width and height of the drawing area
- **background**: Transparent, lined, or grid (matching document canvas type)
- **tool_settings**: Last used color, stroke width, and tool type

### Stroke

- **points**: Array of coordinate objects (x, y, pressure)
- **color**: Hex color value of the stroke
- **width**: Base stroke width (modified by pressure)
- **tool**: Pen or eraser
- **timestamp**: When the stroke was created

## Success Criteria

- Students can install Typenote on their iPad and launch it as a standalone app from the home screen
- Users can create a document containing both typed text and hand-drawn diagrams in a single session
- Apple Pencil drawing feels natural and responsive, with visible pressure sensitivity
- A drawing made on iPad appears on the desktop within 3 seconds via real-time sync
- The app remains usable (view and edit cached documents) when the iPad loses internet connection
- All existing features (text editing, folders, real-time sync) continue to work without regression on both desktop and iPad

## Assumptions

- Users have an iPad running iPadOS 16 or later with Safari
- Users have a 1st or 2nd generation Apple Pencil (both support pressure via Pointer Events in Safari)
- The existing Supabase Realtime infrastructure can handle the additional drawing data payload without requiring schema changes beyond the document content JSONB field
- Drawing data stored as JSON within the existing document content structure will be sufficient for the expected canvas sizes and stroke counts
- The project will continue to be deployed over HTTPS (required for PWA and service workers)
- Touch optimization focuses on iPad tablet form factor; phone-sized optimization is out of scope for this feature

## Out of Scope

- Handwriting-to-text recognition (OCR)
- Shape recognition or auto-correction (e.g., straightening lines into perfect shapes)
- Multi-user simultaneous drawing on the same canvas (collaborative drawing)
- Apple Pencil double-tap gesture customization
- Native App Store distribution
- Android tablet or stylus support (may work incidentally but not explicitly targeted)
- Phone-sized responsive layouts

## Dependencies

- Existing real-time sync infrastructure (Supabase Realtime)
- Existing Tiptap editor with custom node extension support
- HTTPS deployment environment (for PWA/service worker support)
- Existing auto-save mechanism (for persisting drawings)

## Risks

- **Apple Pencil latency in Safari**: Browser-based drawing may have slightly higher latency than native PencilKit. Mitigation: Use requestAnimationFrame and optimize canvas rendering pipeline.
- **Drawing data size**: Complex drawings with many strokes could increase document payload size significantly. Mitigation: Implement stroke simplification for completed strokes and monitor payload sizes.
- **Offline sync conflicts**: Changes made offline on multiple devices could conflict when reconnecting. Mitigation: Use timestamp-based last-write-wins strategy consistent with existing sync approach.
- **Safari PWA limitations**: Safari's PWA support has some limitations compared to Chrome (e.g., no push notifications, limited background sync). Mitigation: Focus on core features that Safari PWA fully supports.
