# Research: Fix Image Resize and Position Not Persisting

## Root Cause Investigation

### Decision: The bug is in `use-auto-save.ts` unmount cleanup
**Rationale**: The cleanup effect (line ~168-173) clears the pending debounce timer without executing the save. When a user resizes an image and navigates away within the 800ms debounce window, the save is silently discarded. The image data is correctly updated in React state (`setPages`) and `triggerSave()` is correctly called -- the problem is purely in the save pipeline's unmount behavior.

**Alternatives considered**:
- Image-specific save bug: Ruled out. `handleImageResize` and `handleImagesMove` both correctly call `setPages()` + `triggerSave()`, identical to stroke/text handling.
- Remote state overwrite: Ruled out. `onRemotePagesUpdate` guards against overwrite when save is pending (`unsaved` or `saving` status).
- `getPagesData` stale ref: Ruled out. `pagesRef.current` is updated via `useEffect([pages])` which runs before the debounced save fires.

## Save-on-Unmount Strategy

### Decision: Fire `saveFnRef.current()` as fire-and-forget on unmount
**Rationale**: This is the simplest fix with the broadest benefit. The `fetch` underlying Next.js server actions continues even after component unmount. React 19 treats state updates on unmounted components as no-ops (no warnings). This approach:
- Requires a single change to one file
- Benefits ALL canvas operations (strokes, text, images), not just images
- Doesn't introduce new dependencies or APIs
- Doesn't block navigation (the save is non-awaited)

**Alternatives considered**:
1. `navigator.sendBeacon()`: Not compatible with Next.js server actions (server actions use internal fetch routing, not plain URL POST). Would require duplicating the save endpoint as a regular API route.
2. Intercept Next.js navigation events: App Router doesn't expose `routeChangeStart` events. Would need `useRouter` workarounds that are fragile and framework-version-dependent.
3. Reduce debounce to 0ms for image operations: Would cause excessive saves during drag operations (resize/move fire many events). The debounce coalescing is correct behavior.
4. `window.onbeforeunload` flush: Already exists for tab close, but doesn't trigger for SPA navigation (which is the primary bug scenario).

## React 19 Unmount Behavior

### Decision: Fire-and-forget async calls are safe on unmount
**Rationale**: In React 19, calling `setState` on an unmounted component is a no-op (no warning, no error). The `performSave` function calls `setStatus('saving')` and then `setStatus('saved')` -- both become no-ops after unmount. The important part (the `fetch` to the server) still completes.

**Evidence**: React 18+ removed the "Can't perform a React state update on an unmounted component" warning. The `fetch` API does not cancel requests when the calling context is garbage-collected.
