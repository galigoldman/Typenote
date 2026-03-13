# Page Overflow Navigation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** When typing fills a page in Type mode, the cursor seamlessly moves to the next page — creating one if needed — so the user can keep writing without interruption, like Word/Google Docs.

**Architecture:** Three bugs to fix: (1) `handleTextOverflow` only works on the last page — remove that guard and support navigating to existing next pages, (2) store a map of page→editor so we can focus existing editors (not just newly created ones), (3) handle single-paragraph overflow by splitting at word boundaries using ProseMirror's `posAtCoords` + `splitBlock`.

**Tech Stack:** React 19, TipTap 3 / ProseMirror, TypeScript

---

### Task 1: Add editor registry map in canvas-editor.tsx

Store every page's TipTap editor in a ref map so we can focus any page's editor directly — not just newly created ones.

**Files:**
- Modify: `src/components/canvas/canvas-editor.tsx:308` (after `pendingFocusPageIdRef`)
- Modify: `src/components/canvas/canvas-editor.tsx:311-321` (handleEditorReady)
- Modify: `src/components/canvas/canvas-editor.tsx:509-520` (handleDeletePage)

**Step 1: Add editorsRef map**

After line 308 (`const pendingFocusPageIdRef = ...`), add:

```typescript
const editorsRef = useRef<Map<string, Editor>>(new Map());
```

**Step 2: Update handleEditorReady to register editors**

Replace lines 311-321 with:

```typescript
const handleEditorReady = useCallback((pageId: string, editor: Editor) => {
  editorsRef.current.set(pageId, editor);
  setActiveEditor(editor);
  if (pendingFocusPageIdRef.current === pageId) {
    pendingFocusPageIdRef.current = null;
    setTimeout(() => {
      editor.commands.focus('end');
    }, 50);
  }
}, []);
```

**Step 3: Clean up editor on page delete**

In `handleDeletePage` (line 509), add `editorsRef.current.delete(pageId);` as the first line inside the callback.

**Step 4: Add data-page-id attribute for scroll targeting**

Change line 741 from `<div key={page.id}>` to:

```tsx
<div key={page.id} data-page-id={page.id}>
```

**Step 5: Commit**

```bash
git add src/components/canvas/canvas-editor.tsx
git commit -m "feat: add editor registry map for cross-page focus"
```

---

### Task 2: Rewrite handleTextOverflow for any page

Remove the "last page only" restriction. Support navigating to existing next pages and creating new pages after any page.

**Files:**
- Modify: `src/components/canvas/canvas-editor.tsx:345-381` (handleTextOverflow)

**Step 1: Replace handleTextOverflow**

Replace lines 345-381 with:

```typescript
// Text overflow handler — moves cursor (and optionally content) to the
// next page, creating one if needed. Works on any page, not just the last.
const handleTextOverflow = useCallback(
  (pageId: string, overflowContent: Record<string, unknown> | null) => {
    let targetPageId: string | null = null;
    let isExistingPage = false;

    setPages((prev) => {
      const pageIndex = prev.findIndex((p) => p.id === pageId);
      if (pageIndex === -1) return prev;

      const nextPage = prev[pageIndex + 1];

      if (nextPage) {
        // Next page already exists — just queue focus (content merge
        // happens via editorsRef after state settles)
        targetPageId = nextPage.id;
        isExistingPage = true;
        pendingFocusPageIdRef.current = nextPage.id;
        return prev;
      }

      // No next page — create one after the current page
      const currentPage = prev[pageIndex];
      const newType = currentPage.pageType || document.canvas_type;
      const newPage = createEmptyPage(pageIndex + 1, newType);
      if (overflowContent) {
        newPage.flowContent = overflowContent;
      }
      targetPageId = newPage.id;
      pendingFocusPageIdRef.current = newPage.id;

      return [
        ...prev.slice(0, pageIndex + 1),
        newPage,
        ...prev.slice(pageIndex + 1),
      ].map((p, i) => ({ ...p, order: i }));
    });

    // Focus the target page and optionally merge overflow content
    setTimeout(() => {
      if (!targetPageId) return;

      const nextEditor = editorsRef.current.get(targetPageId);
      if (nextEditor) {
        if (isExistingPage && overflowContent) {
          // Prepend overflow content to the existing next page
          const existing = nextEditor.getJSON() as {
            type?: string;
            content?: unknown[];
          };
          const merged = {
            type: 'doc',
            content: [
              ...((overflowContent as { content?: unknown[] }).content || []),
              ...(existing?.content || [{ type: 'paragraph' }]),
            ],
          };
          nextEditor.commands.setContent(merged);
        }
        nextEditor.commands.focus('start');
      }

      // Scroll to the target page
      const scrollContainer = globalThis.document.querySelector(
        '[data-scroll-container]',
      ) as HTMLElement | null;
      if (scrollContainer) {
        const targetEl = scrollContainer.querySelector(
          `[data-page-id="${targetPageId}"]`,
        );
        if (targetEl) {
          targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else {
          scrollContainer.scrollTo({
            top: scrollContainer.scrollHeight,
            behavior: 'smooth',
          });
        }
      }
    }, 100);

    triggerSave();
  },
  [triggerSave, document.canvas_type],
);
```

**Step 2: Run tests**

Run: `pnpm test`
Expected: All tests pass (no existing tests directly cover overflow handler)

**Step 3: Commit**

```bash
git add src/components/canvas/canvas-editor.tsx
git commit -m "feat: allow text overflow navigation on any page, not just the last"
```

---

### Task 3: Handle single-paragraph overflow by splitting at word boundary

Currently, when a single long paragraph overflows the page, the code calls `onTextOverflow(null)` — creating an empty next page but leaving the overflowing text orphaned. Fix this by splitting the paragraph at the nearest word boundary using ProseMirror's `posAtCoords` and `splitBlock`.

**Files:**
- Modify: `src/components/canvas/canvas-page.tsx:65` (add isSplittingRef)
- Modify: `src/components/canvas/canvas-page.tsx:232-274` (onUpdate handler)

**Step 1: Add isSplittingRef**

After line 65 (`const overflowNotifiedRef = useRef(false);`), add:

```typescript
const isSplittingRef = useRef(false);
```

**Step 2: Replace the onUpdate handler**

Replace lines 232-274 with:

```typescript
onUpdate: ({ editor: ed }) => {
  // Suppress content saves during split operations to avoid
  // persisting intermediate states
  if (!isSplittingRef.current) {
    onFlowContentUpdateRef.current?.(
      pageIdRef.current,
      ed.getJSON() as Record<string, unknown>,
    );
  }

  // Overflow detection — runs after every edit to check if the
  // cursor has pushed past the page boundary.
  requestAnimationFrame(() => {
    const layer = textLayerRef.current;
    if (!layer || overflowNotifiedRef.current) return;
    try {
      const coords = ed.view.coordsAtPos(ed.state.selection.from);
      const layerRect = layer.getBoundingClientRect();
      const cursorY = coords.bottom - layerRect.top;

      if (cursorY > PAGE_HEIGHT) {
        overflowNotifiedRef.current = true;
        const { doc } = ed.state;

        if (doc.childCount > 1) {
          // Multi-block: extract the last block node
          const lastChild = doc.lastChild!;
          const lastNodeJson = lastChild.toJSON();
          const nodeFrom = doc.content.size - lastChild.nodeSize;
          const nodeTo = doc.content.size;
          ed.chain().deleteRange({ from: nodeFrom, to: nodeTo }).run();
          onTextOverflowRef.current?.(pageIdRef.current, {
            type: 'doc',
            content: [lastNodeJson],
          } as Record<string, unknown>);
        } else {
          // Single block: split at page boundary word break
          const bottomY = layerRect.top + PAGE_HEIGHT - 20;
          const posInfo = ed.view.posAtCoords({
            left: layerRect.left + PAGE_WIDTH / 2,
            top: bottomY,
          });

          if (posInfo && posInfo.pos > 2) {
            let splitPos = posInfo.pos;

            // Walk backward to find a word boundary (space)
            const $pos = doc.resolve(splitPos);
            const text = $pos.parent.textContent;
            const offset = $pos.parentOffset;
            let wordBreak = offset;
            while (wordBreak > 0 && text[wordBreak - 1] !== ' ') {
              wordBreak--;
            }
            if (wordBreak > 0) {
              splitPos = $pos.start() + wordBreak;
            }

            // Split the block, then extract the second half
            isSplittingRef.current = true;
            ed.chain()
              .setTextSelection(splitPos)
              .splitBlock()
              .run();

            const newDoc = ed.state.doc;
            const overflowNodes: unknown[] = [];
            for (let i = 1; i < newDoc.childCount; i++) {
              overflowNodes.push(newDoc.child(i).toJSON());
            }

            const firstBlockEnd = newDoc.child(0).nodeSize;
            ed.chain()
              .deleteRange({
                from: firstBlockEnd,
                to: newDoc.content.size,
              })
              .run();

            isSplittingRef.current = false;

            // Manually save the final state (intermediate was suppressed)
            onFlowContentUpdateRef.current?.(
              pageIdRef.current,
              ed.getJSON() as Record<string, unknown>,
            );

            onTextOverflowRef.current?.(pageIdRef.current, {
              type: 'doc',
              content: overflowNodes,
            } as Record<string, unknown>);
          } else {
            // Can't determine split position — just navigate
            onTextOverflowRef.current?.(pageIdRef.current, null);
          }
        }
      } else if (cursorY < PAGE_HEIGHT - 100) {
        overflowNotifiedRef.current = false;
      }
    } catch {
      /* coordsAtPos can throw before DOM is ready */
    }
  });
},
```

**Step 3: Add PAGE_WIDTH import**

The `PAGE_WIDTH` import already exists at line 14. Verify it's available in scope.

**Step 4: Run tests**

Run: `pnpm test`
Expected: All tests pass

**Step 5: Manual test**

1. Open a document in Type mode
2. Type a long paragraph that fills the entire page
3. Keep typing — the overflowing words should appear on the next page
4. The cursor should be on the next page, ready for typing

**Step 6: Commit**

```bash
git add src/components/canvas/canvas-page.tsx
git commit -m "feat: split single paragraphs at word boundary on page overflow"
```

---

### Task 4: Add ArrowDown navigation to next page

When the cursor is at the end of the document and near the bottom of the page, pressing ArrowDown should navigate to the next page.

**Files:**
- Modify: `src/components/canvas/canvas-page.tsx:210-230` (handleKeyDown)

**Step 1: Extend handleKeyDown**

Replace lines 210-230 with:

```typescript
handleKeyDown: (view, event) => {
  // Enter near bottom → move to next page
  if (event.key === 'Enter' && !event.shiftKey) {
    const layer = textLayerRef.current;
    if (!layer) return false;
    try {
      const coords = view.coordsAtPos(view.state.selection.from);
      const layerRect = layer.getBoundingClientRect();
      const cursorY = coords.bottom - layerRect.top;
      if (cursorY > PAGE_HEIGHT - 60) {
        event.preventDefault();
        onTextOverflowRef.current?.(pageIdRef.current, null);
        return true;
      }
    } catch {
      /* coordsAtPos can throw before DOM is ready */
    }
  }

  // ArrowDown at end of content near page bottom → next page
  if (event.key === 'ArrowDown') {
    const { state } = view;
    const endPos = state.doc.content.size - 1;
    if (state.selection.from >= endPos) {
      const layer = textLayerRef.current;
      if (!layer) return false;
      try {
        const coords = view.coordsAtPos(state.selection.from);
        const layerRect = layer.getBoundingClientRect();
        const cursorY = coords.bottom - layerRect.top;
        if (cursorY > PAGE_HEIGHT * 0.8) {
          event.preventDefault();
          onTextOverflowRef.current?.(pageIdRef.current, null);
          return true;
        }
      } catch {
        /* coordsAtPos can throw before DOM is ready */
      }
    }
  }

  return false;
},
```

**Step 2: Run tests**

Run: `pnpm test`
Expected: All tests pass

**Step 3: Manual test**

1. Type some text on a page (not filling it)
2. Press ArrowDown when at the end of text near the bottom — should move to next page
3. Press ArrowDown when in the middle of text — normal behavior (moves within page)

**Step 4: Commit**

```bash
git add src/components/canvas/canvas-page.tsx
git commit -m "feat: ArrowDown at end of page navigates to next page"
```

---

### Task 5: Run full test suite and verify

**Step 1: Run all tests**

Run: `pnpm test`
Expected: All 23 test files pass, 157+ tests green

**Step 2: Run lint**

Run: `pnpm lint`
Expected: No errors

**Step 3: Final manual smoke test**

Test the full flow:
1. Open a document in Type mode
2. Fill a page with multiple paragraphs → last paragraph moves to next page
3. Fill a page with one long paragraph → text splits at word boundary
4. Press Enter near the bottom → cursor moves to next page
5. Press ArrowDown at end of content near bottom → cursor moves to next page
6. Navigate to page 1 of 3, fill it → overflow goes to page 2 (not a new page at the end)

**Step 4: Commit all remaining changes**

```bash
git add -A
git commit -m "feat: seamless page overflow navigation in Type mode"
```
