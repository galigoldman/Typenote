/**
 * Utilities for splitting TipTap/ProseMirror JSON content at block boundaries.
 *
 * Used by the selection tool when a selection boundary intersects a text area —
 * the text is split into two independent text boxes at the nearest block
 * boundary.
 */

interface ProseMirrorNode {
  type: string;
  content?: ProseMirrorNode[];
  attrs?: Record<string, unknown>;
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
  text?: string;
}

interface ProseMirrorDoc {
  type: 'doc';
  content: ProseMirrorNode[];
}

/**
 * Splits a TipTap JSON document at the given block index.
 *
 * Returns two documents: the first contains blocks [0, blockIndex),
 * the second contains blocks [blockIndex, end).
 *
 * If blockIndex is 0 or >= content length, one side will be null
 * (indicating no split is needed in that direction).
 */
export function splitDocumentAtBlockIndex(
  doc: Record<string, unknown>,
  blockIndex: number,
): [Record<string, unknown> | null, Record<string, unknown> | null] {
  const typed = doc as unknown as ProseMirrorDoc;
  if (!typed.content || typed.content.length === 0) {
    return [null, null];
  }

  if (blockIndex <= 0) {
    return [null, doc];
  }

  if (blockIndex >= typed.content.length) {
    return [doc, null];
  }

  const firstHalf: ProseMirrorDoc = {
    type: 'doc',
    content: typed.content.slice(0, blockIndex),
  };

  const secondHalf: ProseMirrorDoc = {
    type: 'doc',
    content: typed.content.slice(blockIndex),
  };

  return [
    firstHalf as unknown as Record<string, unknown>,
    secondHalf as unknown as Record<string, unknown>,
  ];
}

/**
 * Given a TipTap editor view and a Y coordinate (in page coordinates),
 * finds the nearest block boundary to split at.
 *
 * Uses ProseMirror's posAtCoords to map the Y coordinate to a document
 * position, then resolves to the nearest block-level boundary.
 *
 * Returns the block index (0-based) where the split should occur,
 * or null if the coordinate is outside the editor bounds.
 */
export function findSplitIndex(
  editorView: {
    posAtCoords: (coords: {
      left: number;
      top: number;
    }) => { pos: number } | null;
    state: {
      doc: {
        resolve: (pos: number) => {
          depth: number;
          before: (depth: number) => number;
          parent: { childCount: number };
          index: (depth: number) => number;
        };
      };
    };
    dom: { getBoundingClientRect: () => DOMRect };
  },
  selectionBoundaryY: number,
): number | null {
  const domRect = editorView.dom.getBoundingClientRect();

  // Map the Y coordinate to editor viewport coordinates
  const coords = {
    left: domRect.left + domRect.width / 2, // center of editor
    top: selectionBoundaryY,
  };

  const posData = editorView.posAtCoords(coords);
  if (!posData) return null;

  const resolved = editorView.state.doc.resolve(posData.pos);

  // Walk up to the top-level block (depth 1 = direct child of doc)
  // and return its index
  if (resolved.depth === 0) return 0;

  const blockIndex = resolved.index(1);
  return blockIndex;
}
