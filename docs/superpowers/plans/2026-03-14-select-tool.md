# Select Tool & Text-as-Text-Boxes Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Select tool for moving/resizing objects and migrate all text to a text-box model so text can be selected, moved, and resized like in GoodNotes/Notability.

**Architecture:** All text lives in `TextBox` containers (positioned, sized TipTap editors). Three top-level modes: Draw / Select / Type. The Select tool uses rectangle selection, tap-to-select, and drag-to-move with the existing `useSelection` hook and `SelectionOverlay` as foundation. Full-page text boxes auto-flow like Google Docs; custom text boxes have fixed boundaries.

**Tech Stack:** TypeScript, React 19, Next.js 16, TipTap 3, Canvas 2D API, perfect-freehand

**Spec:** `docs/superpowers/specs/2026-03-14-select-tool-design.md`

---

## Chunk 1: Type System & Data Model

### Task 1: Update TextBox type and CanvasTool

**Files:**

- Modify: `src/types/canvas.ts:24-31` (TextBox interface)
- Modify: `src/types/canvas.ts:52` (CanvasTool type)
- Modify: `src/types/database.test.ts` (add type assertions)

- [ ] **Step 1: Update TextBox interface**

In `src/types/canvas.ts`, replace the TextBox interface (lines 24-31):

```typescript
export interface TextBox {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  content: Record<string, unknown> | null;
  isFullPage: boolean;
  zIndex: number;
  linkedNextId?: string;
}
```

- [ ] **Step 2: Add 'select' to CanvasTool**

In `src/types/canvas.ts`, update the CanvasTool type (line 52):

```typescript
export type CanvasTool = 'pen' | 'highlighter' | 'eraser' | 'select' | 'text';
```

- [ ] **Step 3: Run existing tests to verify no breakage**

Run: `pnpm test -- --run src/types/database.test.ts`
Expected: PASS (type changes are additive)

- [ ] **Step 4: Run lint**

Run: `pnpm lint`
Expected: Only pre-existing warnings

- [ ] **Step 5: Commit**

```bash
git add src/types/canvas.ts
git commit -m "feat: add select tool type and extend TextBox with isFullPage, zIndex, linkedNextId"
```

---

### Task 2: Replace StrokeAction with CanvasAction

**Files:**

- Modify: `src/components/canvas/canvas-editor.tsx:195-200` (action type)
- Modify: `src/components/canvas/canvas-editor.tsx:248-293` (undo/redo handlers)

- [ ] **Step 1: Define CanvasAction type**

In `canvas-editor.tsx`, replace the `StrokeAction` type (around line 195) with:

```typescript
type CanvasAction =
  | { type: 'stroke-add'; pageId: string; stroke: Stroke }
  | { type: 'stroke-remove'; pageId: string; stroke: Stroke }
  | { type: 'textbox-add'; pageId: string; textBox: TextBox }
  | { type: 'textbox-remove'; pageId: string; textBox: TextBox }
  | {
      type: 'textbox-move';
      pageId: string;
      textBoxId: string;
      fromX: number;
      fromY: number;
      toX: number;
      toY: number;
    }
  | {
      type: 'textbox-resize';
      pageId: string;
      textBoxId: string;
      fromWidth: number;
      fromHeight: number;
      toWidth: number;
      toHeight: number;
    }
  | {
      type: 'textbox-split';
      pageId: string;
      originalId: string;
      topBox: TextBox;
      bottomBox: TextBox;
    };
```

- [ ] **Step 2: Update undo handler**

Update `handleUndo` to handle all action types. The stroke actions map `'stroke-add'`→undo removes stroke, `'stroke-remove'`→undo restores stroke. Text box actions reverse accordingly. For `'textbox-move'`, undo moves back to `fromX, fromY`. For `'textbox-split'`, undo re-merges the two boxes into the original.

- [ ] **Step 3: Update redo handler**

Mirror of undo — replay actions forward.

- [ ] **Step 4: Update handleStrokeAdd and handleStrokeRemove**

Change the push calls from `{ type: 'add', ... }` to `{ type: 'stroke-add', ... }` and `{ type: 'remove', ... }` to `{ type: 'stroke-remove', ... }`.

- [ ] **Step 5: Run tests**

Run: `pnpm test`
Expected: All existing tests pass (undo/redo behavior unchanged, just renamed action types)

- [ ] **Step 6: Commit**

```bash
git add src/components/canvas/canvas-editor.tsx
git commit -m "refactor: replace StrokeAction with polymorphic CanvasAction for undo/redo"
```

---

## Chunk 2: Toolbar & Mode Switching

### Task 3: Add Select button to toolbar

**Files:**

- Modify: `src/components/canvas/canvas-editor.tsx` (toolbar section, ~lines 735-830)

- [ ] **Step 1: Import MousePointer2 icon**

Add to lucide-react imports:

```typescript
import { ..., MousePointer2 } from 'lucide-react';
```

- [ ] **Step 2: Add Select button between Draw and Type**

In the toolbar's mode toggle section, add a Select button. The three buttons should be:

```tsx
{
  /* Draw button */
}
<button
  onPointerDown={(e) => {
    e.stopPropagation();
    if (!isDrawMode) setActiveTool('pen');
  }}
  className={`... ${isDrawMode ? 'bg-primary text-primary-foreground' : 'hover:bg-accent text-muted-foreground'}`}
>
  <Pen className="h-4 w-4" /> Draw
</button>;

{
  /* Select button */
}
<button
  onPointerDown={(e) => {
    e.stopPropagation();
    setActiveTool('select');
  }}
  className={`... ${activeTool === 'select' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent text-muted-foreground'}`}
>
  <MousePointer2 className="h-4 w-4" /> Select
</button>;

{
  /* Type button */
}
<button
  onPointerDown={(e) => {
    e.stopPropagation();
    setActiveTool('text');
  }}
  className={`... ${activeTool === 'text' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent text-muted-foreground'}`}
>
  <Type className="h-4 w-4" /> Type
</button>;
```

- [ ] **Step 3: Update isDrawMode check**

The existing `isDrawMode` boolean already excludes `'select'` and `'text'`, so no change needed. But verify the draw sub-tools (pen/highlighter/eraser) and right sidebar only show when `isDrawMode` is true.

- [ ] **Step 4: Hide text formatting toolbar in Select mode**

The existing condition `activeTool === 'text' && activeEditor` already gates the toolbar. Verify Select mode shows neither draw sub-tools nor text toolbar.

- [ ] **Step 5: Run app and verify visually**

Run: `pnpm dev`
Verify: Three-button toolbar renders. Clicking Select highlights it. Draw sub-tools hide. Text toolbar hides.

- [ ] **Step 6: Commit**

```bash
git add src/components/canvas/canvas-editor.tsx
git commit -m "feat: add Select button to toolbar as third top-level mode"
```

---

### Task 4: Update interaction layer for Select mode

**Files:**

- Modify: `src/components/canvas/canvas-page.tsx:69-72` (isInteractionMode)

- [ ] **Step 1: Add select to isInteractionMode**

```typescript
const isInteractionMode =
  activeTool === 'pen' ||
  activeTool === 'highlighter' ||
  activeTool === 'eraser' ||
  activeTool === 'select';
```

This ensures the interaction layer captures pointer events in Select mode and the text layer has `pointerEvents: 'none'`.

- [ ] **Step 2: Run tests**

Run: `pnpm test`
Expected: All pass

- [ ] **Step 3: Commit**

```bash
git add src/components/canvas/canvas-page.tsx
git commit -m "feat: route pointer events through interaction layer in Select mode"
```

---

## Chunk 3: Selection Logic

### Task 5: Update useSelection hook for select tool

**Files:**

- Modify: `src/hooks/use-selection.ts`

- [ ] **Step 1: Fix tool name check**

Change all instances of `activeTool !== ('selection' as CanvasTool)` to `activeTool !== 'select'`.

- [ ] **Step 2: Accept all pointer types**

Remove the `if (e.pointerType !== 'pen') return;` guards in `handlePointerDown`, `handlePointerMove`, and `handlePointerUp`. The select tool should respond to pen, touch, and mouse.

- [ ] **Step 3: Add text box selection support**

Add `getPageTextBoxes` to the options interface:

```typescript
interface UseSelectionOptions {
  activeTool: CanvasTool;
  onStrokeMove?: (
    pageId: string,
    strokeId: string,
    dx: number,
    dy: number,
  ) => void;
  getPageStrokes: (pageId: string) => Stroke[];
  getPageTextBoxes: (pageId: string) => TextBox[];
  onTextBoxMove?: (
    pageId: string,
    textBoxId: string,
    dx: number,
    dy: number,
  ) => void;
  onModeChange?: (mode: CanvasTool) => void;
}
```

Add `selectedTextBoxIds` to the state and return interface.

- [ ] **Step 4: Implement text box hit detection in handlePointerUp**

After the existing stroke hit detection, check if any text boxes intersect the selection rectangle:

```typescript
const textBoxes = getPageTextBoxes(pageId);
const hitTextBoxes = textBoxes.filter((tb) => {
  const tbBox: BBox = {
    minX: tb.x,
    minY: tb.y,
    maxX: tb.x + tb.width,
    maxY: tb.y + tb.height,
  };
  return aabbIntersectsRect(tbBox, selectionRect);
});
```

- [ ] **Step 5: Implement tap-to-select for single objects**

When the selection rectangle is very small (< 5px), treat it as a tap. Check strokes and text boxes at that point:

```typescript
const isTap = selectionWidth < 5 && selectionHeight < 5;
if (isTap) {
  // Check text boxes first (they render on top)
  const tappedTextBox = textBoxes.find(
    (tb) =>
      tapX >= tb.x &&
      tapX <= tb.x + tb.width &&
      tapY >= tb.y &&
      tapY <= tb.y + tb.height,
  );
  // Then check strokes
}
```

- [ ] **Step 6: Add double-tap detection**

Track last tap time and position. If two taps within 300ms and 15px, it's a double-tap:

```typescript
const lastTapRef = useRef<{ time: number; x: number; y: number } | null>(null);
// In handlePointerUp, when isTap:
const now = Date.now();
const last = lastTapRef.current;
if (
  last &&
  now - last.time < 300 &&
  Math.hypot(tapX - last.x, tapY - last.y) < 15
) {
  // Double-tap detected — if on a text box, call onModeChange('text')
}
lastTapRef.current = { time: now, x: tapX, y: tapY };
```

- [ ] **Step 7: Implement drag-to-move for text boxes**

When in `'dragging'` state with selected text boxes, call `onTextBoxMove` with delta offsets.

- [ ] **Step 8: Run tests**

Run: `pnpm test`
Expected: All pass

- [ ] **Step 9: Commit**

```bash
git add src/hooks/use-selection.ts
git commit -m "feat: extend useSelection for all pointer types, text box selection, and double-tap"
```

---

### Task 6: Wire SelectionOverlay into CanvasPage

**Files:**

- Modify: `src/components/canvas/canvas-page.tsx`
- Modify: `src/components/canvas/selection-overlay.tsx` (if needed)

- [ ] **Step 1: Import SelectionOverlay**

```typescript
import { SelectionOverlay } from './selection-overlay';
```

- [ ] **Step 2: Accept selection props from parent**

Add to CanvasPage props:

```typescript
selectionPath?: [number, number][] | null;
isRectMode?: boolean;
selectionBBox?: BBox | null;
isDragging?: boolean;
dragOffset?: { x: number; y: number };
```

- [ ] **Step 3: Render SelectionOverlay**

Add after the eraser cursor layer, before the interaction layer:

```tsx
{
  activeTool === 'select' && (
    <SelectionOverlay
      selectionPath={selectionPath ?? null}
      isRectMode={isRectMode ?? true}
      selectionBBox={selectionBBox ?? null}
      isDragging={isDragging ?? false}
      dragOffset={dragOffset ?? { x: 0, y: 0 }}
    />
  );
}
```

- [ ] **Step 4: Run app and verify**

Switch to Select mode, drag on canvas — should see dashed rectangle. Release — selected strokes should show bounding box with handles.

- [ ] **Step 5: Commit**

```bash
git add src/components/canvas/canvas-page.tsx
git commit -m "feat: render SelectionOverlay in canvas page during Select mode"
```

---

## Chunk 4: Text Box Rendering & Migration

### Task 7: Render text boxes on the canvas page

**Files:**

- Modify: `src/components/canvas/canvas-page.tsx` (add text box rendering)
- Modify: `src/components/canvas/text-box.tsx` (update props)

- [ ] **Step 1: Update TextBox component props**

Add `isFullPage` and `activeTool` props. For full-page boxes, use `minHeight` (allows growth). For custom boxes, use fixed `height` with `overflow: hidden`.

- [ ] **Step 2: Render text boxes in CanvasPage**

In the text layer (layer 4), after the flow content editor, render text boxes:

```tsx
{
  page.textBoxes.map((tb) => (
    <TextBoxComponent
      key={tb.id}
      textBox={tb}
      isSelected={false} // will be wired to selection state later
      activeTool={activeTool}
      onContentUpdate={(id, content) =>
        onTextBoxContentUpdate?.(page.id, id, content)
      }
    />
  ));
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/canvas/canvas-page.tsx src/components/canvas/text-box.tsx
git commit -m "feat: render text boxes on canvas pages"
```

---

### Task 8: Migrate flowContent to text box on load

**Files:**

- Modify: `src/components/canvas/canvas-editor.tsx` (initializePagesFromDocument)

- [ ] **Step 1: Update initializePagesFromDocument**

In the `initializePagesFromDocument` function, after loading pages, migrate any `flowContent` to a text box:

```typescript
function migrateFlowContentToTextBox(page: CanvasPageData): CanvasPageData {
  if (page.flowContent && page.textBoxes.length === 0) {
    const fullPageTextBox: TextBox = {
      id: Math.random().toString(36).slice(2) + Date.now().toString(36),
      x: 40,
      y: 40,
      width: PAGE_WIDTH - 80,
      height: PAGE_HEIGHT - 80,
      content: page.flowContent,
      isFullPage: true,
      zIndex: 0,
    };
    return { ...page, textBoxes: [fullPageTextBox], flowContent: null };
  }
  // If both exist, prefer textBoxes (partially migrated)
  if (page.textBoxes.length > 0) {
    return { ...page, flowContent: null };
  }
  return page;
}
```

Call this for each page during initialization.

- [ ] **Step 2: Run app and verify**

Open an existing document with text. Verify text appears in a text box (visually identical to before). Switch to Select mode and tap the text — should see bounding box.

- [ ] **Step 3: Commit**

```bash
git add src/components/canvas/canvas-editor.tsx
git commit -m "feat: auto-migrate flowContent to full-page text box on load"
```

---

## Chunk 5: Text Box Creation & Mode Transitions

### Task 9: Create text boxes in Type mode

**Files:**

- Modify: `src/components/canvas/canvas-page.tsx` (tap handler in Type mode)
- Modify: `src/components/canvas/canvas-editor.tsx` (text box add handler)

- [ ] **Step 1: Handle tap in Type mode**

When `activeTool === 'text'` and user taps on empty space (not inside an existing text box), create a full-page text box at that position:

```typescript
if (activeTool === 'text' && !tappedExistingTextBox) {
  const newTextBox: TextBox = {
    id: Math.random().toString(36).slice(2) + Date.now().toString(36),
    x: 40,
    y: tapY,
    width: PAGE_WIDTH - 80,
    height: PAGE_HEIGHT - tapY - 40,
    content: null,
    isFullPage: true,
    zIndex: page.textBoxes.length,
  };
  onTextBoxAdd(page.id, newTextBox);
}
```

- [ ] **Step 2: Handle tap on existing text box in Type mode**

Focus the TipTap editor inside that text box at the tap position.

- [ ] **Step 3: Implement mode transitions**

- Double-tap text box in Select → set `activeTool = 'text'`, focus that text box
- Tap outside any text box in Type → set `activeTool = 'pen'` (Draw is home mode)

- [ ] **Step 4: Test mode transitions manually**

Verify: Select mode → double-tap text → enters Type mode → tap outside → returns to Draw mode.

- [ ] **Step 5: Commit**

```bash
git add src/components/canvas/canvas-page.tsx src/components/canvas/canvas-editor.tsx
git commit -m "feat: create text boxes in Type mode and implement mode transitions"
```

---

### Task 10: Move and resize selected objects

**Files:**

- Modify: `src/hooks/use-selection.ts` (drag handlers)
- Modify: `src/components/canvas/canvas-editor.tsx` (move/resize callbacks)

- [ ] **Step 1: Implement stroke move callback**

In canvas-editor.tsx, add `handleStrokeMove`:

```typescript
const handleStrokeMove = useCallback(
  (pageId: string, strokeId: string, dx: number, dy: number) => {
    setPages((prev) =>
      prev.map((p) => {
        if (p.id !== pageId) return p;
        return {
          ...p,
          strokes: p.strokes.map((s) => {
            if (s.id !== strokeId) return s;
            return {
              ...s,
              points: s.points.map(
                ([x, y, pressure]) => [x + dx, y + dy, pressure] as StrokePoint,
              ),
              bbox: {
                minX: s.bbox.minX + dx,
                minY: s.bbox.minY + dy,
                maxX: s.bbox.maxX + dx,
                maxY: s.bbox.maxY + dy,
              },
            };
          }),
        };
      }),
    );
    triggerSave();
  },
  [triggerSave],
);
```

- [ ] **Step 2: Implement text box move callback**

```typescript
const handleTextBoxMove = useCallback(
  (pageId: string, textBoxId: string, dx: number, dy: number) => {
    setPages((prev) =>
      prev.map((p) => {
        if (p.id !== pageId) return p;
        return {
          ...p,
          textBoxes: p.textBoxes.map((tb) => {
            if (tb.id !== textBoxId) return tb;
            return { ...tb, x: tb.x + dx, y: tb.y + dy, isFullPage: false }; // Moving converts to custom
          }),
        };
      }),
    );
    triggerSave();
  },
  [triggerSave],
);
```

Note: Moving a full-page text box converts it to custom (`isFullPage: false`).

- [ ] **Step 3: Wire callbacks into useSelection hook**

Pass `handleStrokeMove` and `handleTextBoxMove` to the `useSelection` hook.

- [ ] **Step 4: Push undo actions for moves**

Before applying the move, push a `textbox-move` or compute stroke move delta for undo stack.

- [ ] **Step 5: Test manually**

Select a stroke → drag → it moves. Select a text box → drag → it moves. Undo → moves back.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/use-selection.ts src/components/canvas/canvas-editor.tsx
git commit -m "feat: move selected strokes and text boxes with undo support"
```

---

## Chunk 6: Polish & Integration

### Task 11: Delete selected objects

**Files:**

- Modify: `src/components/canvas/canvas-editor.tsx` (delete handler + keyboard)

- [ ] **Step 1: Add delete handler**

```typescript
const handleDeleteSelected = useCallback(
  (pageId: string, strokeIds: string[], textBoxIds: string[]) => {
    // Push undo actions for each deleted object
    // Remove strokes and text boxes from page
    setPages((prev) =>
      prev.map((p) => {
        if (p.id !== pageId) return p;
        return {
          ...p,
          strokes: p.strokes.filter((s) => !strokeIds.includes(s.id)),
          textBoxes: p.textBoxes.filter((tb) => !textBoxIds.includes(tb.id)),
        };
      }),
    );
    triggerSave();
  },
  [triggerSave],
);
```

- [ ] **Step 2: Add keyboard listener for Delete/Backspace in Select mode**

```typescript
useEffect(() => {
  if (activeTool !== 'select') return;
  const handler = (e: KeyboardEvent) => {
    if (e.key === 'Delete' || e.key === 'Backspace') {
      // Call delete on currently selected objects
    }
  };
  window.addEventListener('keydown', handler);
  return () => window.removeEventListener('keydown', handler);
}, [activeTool]);
```

- [ ] **Step 3: Commit**

```bash
git add src/components/canvas/canvas-editor.tsx
git commit -m "feat: delete selected objects with Delete key"
```

---

### Task 12: Run full test suite and fix lint

**Files:**

- All modified files

- [ ] **Step 1: Run lint**

Run: `pnpm lint`
Fix any errors (unused imports, missing types).

- [ ] **Step 2: Run format check**

Run: `pnpm format:check`
Fix with: `pnpm prettier --write <files>`

- [ ] **Step 3: Run full test suite**

Run: `pnpm test`
Expected: All tests pass. Fix any failures from our changes.

- [ ] **Step 4: Commit fixes**

```bash
git add -A
git commit -m "fix: resolve lint and format issues"
```

---

### Task 13: Manual integration testing

- [ ] **Step 1: Test Select mode basics**
  - Switch to Select mode via toolbar
  - Tap a stroke → bounding box appears
  - Tap empty space → deselects
  - Drag rectangle → selects multiple objects

- [ ] **Step 2: Test text box interaction**
  - Open document with existing text → text appears in migrated text box
  - In Select mode, tap text → text box selected
  - Double-tap text box → switches to Type mode
  - Type some text → tap outside → returns to Draw mode

- [ ] **Step 3: Test move**
  - Select a stroke → drag → moves
  - Select a text box → drag → moves
  - Undo → moves back

- [ ] **Step 4: Test Type mode text box creation**
  - Switch to Type mode
  - Tap on empty space → full-page text box created
  - Type text → text appears
  - Switch to Select → tap text box → shows bounding box

- [ ] **Step 5: Test on iPad**
  - All above with touch and Apple Pencil
  - Verify scroll still works
  - Verify pinch-to-zoom still works
