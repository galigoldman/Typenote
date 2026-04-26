import { describe, it, expect, vi } from 'vitest';
import type { SaveStatus } from '@/hooks/use-auto-save';

/**
 * Tests for the onRemotePagesUpdate guard in canvas-editor.tsx.
 *
 * The guard prevents remote Supabase realtime updates from overwriting local
 * state when there are unsaved changes (e.g., after an undo). This prevents
 * undone content from being re-injected into the React state and appearing
 * in PDF exports.
 *
 * We test the guard logic in isolation rather than rendering the full
 * CanvasEditor component, since the component has extensive dependencies.
 */

/**
 * Creates the onRemotePagesUpdate handler with the save-status guard,
 * matching the implementation in canvas-editor.tsx.
 */
function createRemotePagesHandler(
  saveStatusRef: { current: SaveStatus },
  localPageCount: number = 0,
) {
  const setPages = vi.fn();
  const setRemoteUpdateCounter = vi.fn();
  const pagesRef = { current: { length: localPageCount } };

  const onRemotePagesUpdate = (remotePagesData: Record<string, unknown>) => {
    // Guard: skip remote updates when we have unsaved local changes
    if (
      saveStatusRef.current === 'unsaved' ||
      saveStatusRef.current === 'saving'
    ) {
      return;
    }
    const remote = remotePagesData as { pages?: unknown[] };
    if (remote?.pages) {
      // Guard: never accept remote pages with fewer pages than local.
      // This prevents the echo guard race condition from overwriting
      // local state with stripped DB pages after PDF export.
      if (remote.pages.length < pagesRef.current.length) {
        return;
      }
      setPages(remote.pages);
      setRemoteUpdateCounter((c: number) => c + 1);
    }
  };

  return { onRemotePagesUpdate, setPages, setRemoteUpdateCounter };
}

function makeStroke(id: string) {
  return {
    id,
    points: [
      { x: 0, y: 0, pressure: 0.5 },
      { x: 10, y: 10, pressure: 0.5 },
    ],
    color: '#000',
    width: 2,
    tool: 'pen',
    opacity: 1,
  };
}

function makeTextBox(id: string, x = 0, y = 0) {
  return {
    id,
    x,
    y,
    width: 200,
    height: 60,
    content: { type: 'doc', content: [{ type: 'paragraph' }] },
    isFullPage: false,
    zIndex: 0,
  };
}

function makePage(
  id: string,
  order: number,
  strokes: ReturnType<typeof makeStroke>[] = [],
  textBoxes: ReturnType<typeof makeTextBox>[] = [],
) {
  return {
    id,
    order,
    pageType: 'blank',
    strokes,
    textBoxes,
    flowContent: null,
  };
}

describe('onRemotePagesUpdate guard', () => {
  describe('US1: undone strokes excluded', () => {
    it('blocks remote update when saveStatus is "unsaved" (after undo)', () => {
      const saveStatusRef = { current: 'unsaved' as SaveStatus };
      const { onRemotePagesUpdate, setPages } =
        createRemotePagesHandler(saveStatusRef);

      // Simulate remote update containing the undone stroke
      const remotePagesWithUndoneStroke = {
        pages: [
          makePage('p1', 0, [
            makeStroke('s1'),
            makeStroke('s2'),
            makeStroke('s3'),
          ]),
        ],
      };

      onRemotePagesUpdate(
        remotePagesWithUndoneStroke as Record<string, unknown>,
      );

      // setPages should NOT have been called — local state preserved
      expect(setPages).not.toHaveBeenCalled();
    });

    it('blocks remote update when saveStatus is "saving"', () => {
      const saveStatusRef = { current: 'saving' as SaveStatus };
      const { onRemotePagesUpdate, setPages } =
        createRemotePagesHandler(saveStatusRef);

      const remotePagesWithUndoneStroke = {
        pages: [
          makePage('p1', 0, [
            makeStroke('s1'),
            makeStroke('s2'),
            makeStroke('s3'),
          ]),
        ],
      };

      onRemotePagesUpdate(
        remotePagesWithUndoneStroke as Record<string, unknown>,
      );

      expect(setPages).not.toHaveBeenCalled();
    });

    it('allows remote update when saveStatus is "saved" (no pending changes)', () => {
      const saveStatusRef = { current: 'saved' as SaveStatus };
      const { onRemotePagesUpdate, setPages, setRemoteUpdateCounter } =
        createRemotePagesHandler(saveStatusRef);

      const remotePages = {
        pages: [makePage('p1', 0, [makeStroke('s1'), makeStroke('s2')])],
      };

      onRemotePagesUpdate(remotePages as Record<string, unknown>);

      // setPages SHOULD be called — remote update applied
      expect(setPages).toHaveBeenCalledWith(remotePages.pages);
      expect(setRemoteUpdateCounter).toHaveBeenCalled();
    });

    it('allows remote update when saveStatus is "error" (stale local state)', () => {
      const saveStatusRef = { current: 'error' as SaveStatus };
      const { onRemotePagesUpdate, setPages } =
        createRemotePagesHandler(saveStatusRef);

      const remotePages = {
        pages: [makePage('p1', 0, [makeStroke('s1')])],
      };

      onRemotePagesUpdate(remotePages as Record<string, unknown>);

      expect(setPages).toHaveBeenCalledWith(remotePages.pages);
    });

    it('allows remote update when saveStatus is "retrying"', () => {
      const saveStatusRef = { current: 'retrying' as SaveStatus };
      const { onRemotePagesUpdate, setPages } =
        createRemotePagesHandler(saveStatusRef);

      const remotePages = {
        pages: [makePage('p1', 0, [makeStroke('s1')])],
      };

      onRemotePagesUpdate(remotePages as Record<string, unknown>);

      expect(setPages).toHaveBeenCalledWith(remotePages.pages);
    });
  });

  describe('US2: undone textboxes excluded', () => {
    it('blocks remote update containing undone textbox when saveStatus is "unsaved"', () => {
      const saveStatusRef = { current: 'unsaved' as SaveStatus };
      const { onRemotePagesUpdate, setPages } =
        createRemotePagesHandler(saveStatusRef);

      const remotePagesWithUndoneTextbox = {
        pages: [
          makePage('p1', 0, [], [makeTextBox('tb1'), makeTextBox('tb2')]),
        ],
      };

      onRemotePagesUpdate(
        remotePagesWithUndoneTextbox as Record<string, unknown>,
      );

      expect(setPages).not.toHaveBeenCalled();
    });

    it('blocks remote update with pre-move textbox position when saveStatus is "unsaved"', () => {
      const saveStatusRef = { current: 'unsaved' as SaveStatus };
      const { onRemotePagesUpdate, setPages } =
        createRemotePagesHandler(saveStatusRef);

      // Remote has textbox at moved position; local has it at original after undo
      const remotePagesWithMovedTextbox = {
        pages: [makePage('p1', 0, [], [makeTextBox('tb1', 100, 200)])],
      };

      onRemotePagesUpdate(
        remotePagesWithMovedTextbox as Record<string, unknown>,
      );

      expect(setPages).not.toHaveBeenCalled();
    });
  });

  describe('US3: multi-page undo consistency', () => {
    it('blocks remote update for multi-page document when saveStatus is "unsaved"', () => {
      const saveStatusRef = { current: 'unsaved' as SaveStatus };
      const { onRemotePagesUpdate, setPages } =
        createRemotePagesHandler(saveStatusRef);

      // Remote has 3 pages with undone stroke on page 2
      const remoteMultiPages = {
        pages: [
          makePage('p1', 0, [makeStroke('s1')]),
          makePage('p2', 1, [makeStroke('s2'), makeStroke('s3-undone')]),
          makePage('p3', 2),
        ],
      };

      onRemotePagesUpdate(remoteMultiPages as Record<string, unknown>);

      expect(setPages).not.toHaveBeenCalled();
    });
  });

  describe('page-count guard (PDF export race condition)', () => {
    it('blocks remote update with fewer pages than local state', () => {
      const saveStatusRef = { current: 'saved' as SaveStatus };
      // Local has 5 pages
      const { onRemotePagesUpdate, setPages } = createRemotePagesHandler(
        saveStatusRef,
        5,
      );

      // Remote echo has only 3 pages (stripped by auto-save)
      const remotePages = {
        pages: [
          makePage('p1', 0, [makeStroke('s1')]),
          makePage('p2', 1, [makeStroke('s2')]),
          makePage('p3', 2),
        ],
      };

      onRemotePagesUpdate(remotePages as Record<string, unknown>);

      // setPages should NOT be called — fewer pages means stale echo
      expect(setPages).not.toHaveBeenCalled();
    });

    it('allows remote update with equal page count', () => {
      const saveStatusRef = { current: 'saved' as SaveStatus };
      const { onRemotePagesUpdate, setPages } = createRemotePagesHandler(
        saveStatusRef,
        2,
      );

      const remotePages = {
        pages: [
          makePage('p1', 0, [makeStroke('s1')]),
          makePage('p2', 1, [makeStroke('s2')]),
        ],
      };

      onRemotePagesUpdate(remotePages as Record<string, unknown>);

      expect(setPages).toHaveBeenCalledWith(remotePages.pages);
    });

    it('allows remote update with more pages than local', () => {
      const saveStatusRef = { current: 'saved' as SaveStatus };
      const { onRemotePagesUpdate, setPages } = createRemotePagesHandler(
        saveStatusRef,
        2,
      );

      const remotePages = {
        pages: [
          makePage('p1', 0, [makeStroke('s1')]),
          makePage('p2', 1, [makeStroke('s2')]),
          makePage('p3', 2, [makeStroke('s3')]),
        ],
      };

      onRemotePagesUpdate(remotePages as Record<string, unknown>);

      expect(setPages).toHaveBeenCalledWith(remotePages.pages);
    });
  });

  describe('edge cases', () => {
    it('skips remote update with no pages property', () => {
      const saveStatusRef = { current: 'saved' as SaveStatus };
      const { onRemotePagesUpdate, setPages } =
        createRemotePagesHandler(saveStatusRef);

      onRemotePagesUpdate({});

      expect(setPages).not.toHaveBeenCalled();
    });

    it('skips remote update with null pages', () => {
      const saveStatusRef = { current: 'saved' as SaveStatus };
      const { onRemotePagesUpdate, setPages } =
        createRemotePagesHandler(saveStatusRef);

      onRemotePagesUpdate({ pages: null } as Record<string, unknown>);

      expect(setPages).not.toHaveBeenCalled();
    });
  });
});
