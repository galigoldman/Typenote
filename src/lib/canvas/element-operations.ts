import { v4 as uuid } from 'uuid';

import type {
  CanvasDocument,
  CanvasElement,
  TextBlock,
  DrawingLayer,
  ElementMap,
} from '@/lib/canvas/types';
import {
  EMPTY_TIPTAP_DOC,
  DEFAULT_TEXT_BLOCK_WIDTH,
  DEFAULT_TEXT_BLOCK_HEIGHT,
  MIN_ELEMENT_WIDTH,
  MIN_ELEMENT_HEIGHT,
} from '@/lib/canvas/types';

// ---------------------------------------------------------------------------
// Command interface for undo/redo
// ---------------------------------------------------------------------------

export interface Command {
  type: string;
  execute(): void;
  undo(): void;
}

// ---------------------------------------------------------------------------
// Element factory functions
// ---------------------------------------------------------------------------

/**
 * Create a new TextBlock element at the given position.
 * Dimensions fall back to defaults when not provided.
 */
export function createTextBlock(
  x: number,
  y: number,
  width: number = DEFAULT_TEXT_BLOCK_WIDTH,
  height: number = DEFAULT_TEXT_BLOCK_HEIGHT
): TextBlock {
  return {
    type: 'text-block',
    x,
    y,
    width,
    height,
    zOrder: 0,
    content: { ...EMPTY_TIPTAP_DOC },
  };
}

/**
 * Create a new DrawingLayer element at the given position and size.
 */
export function createDrawingLayer(
  x: number,
  y: number,
  width: number,
  height: number
): DrawingLayer {
  return {
    type: 'drawing-layer',
    x,
    y,
    width,
    height,
    zOrder: 0,
    strokes: [],
  };
}

// ---------------------------------------------------------------------------
// Document-level pure operations
// ---------------------------------------------------------------------------

/**
 * Return a new CanvasDocument with the element added under `id`.
 * The id is appended to the zOrder array (placed on top).
 */
export function addElement(
  doc: CanvasDocument,
  id: string,
  element: CanvasElement
): CanvasDocument {
  const newElements: ElementMap = { ...doc.elements, [id]: element };
  const newZOrder = [...doc.zOrder, id];

  return {
    ...doc,
    elements: newElements,
    zOrder: newZOrder,
  };
}

/**
 * Return a new CanvasDocument with the element removed.
 * Removes from both the elements map and the zOrder array.
 */
export function removeElement(
  doc: CanvasDocument,
  id: string
): CanvasDocument {
  const { [id]: _removed, ...remainingElements } = doc.elements;
  const newZOrder = doc.zOrder.filter((eid) => eid !== id);

  return {
    ...doc,
    elements: remainingElements,
    zOrder: newZOrder,
  };
}

/**
 * Return a new CanvasDocument with the element moved to (x, y).
 */
export function moveElement(
  doc: CanvasDocument,
  id: string,
  x: number,
  y: number
): CanvasDocument {
  const element = doc.elements[id];
  if (!element) return doc;

  const updated: CanvasElement = { ...element, x, y };

  return {
    ...doc,
    elements: { ...doc.elements, [id]: updated },
  };
}

/**
 * Return a new CanvasDocument with the element resized.
 * Width and height are clamped to the minimum allowed dimensions.
 */
export function resizeElement(
  doc: CanvasDocument,
  id: string,
  width: number,
  height: number
): CanvasDocument {
  const element = doc.elements[id];
  if (!element) return doc;

  const clampedWidth = Math.max(width, MIN_ELEMENT_WIDTH);
  const clampedHeight = Math.max(height, MIN_ELEMENT_HEIGHT);

  const updated: CanvasElement = {
    ...element,
    width: clampedWidth,
    height: clampedHeight,
  };

  return {
    ...doc,
    elements: { ...doc.elements, [id]: updated },
  };
}

/**
 * Return a new CanvasDocument with the zOrder array updated.
 *
 * Directions:
 *  - 'forward'  — swap with the element one index higher (closer to front)
 *  - 'backward' — swap with the element one index lower  (closer to back)
 *  - 'front'    — move to the very end of the array (top)
 *  - 'back'     — move to the very start of the array (bottom)
 */
export function updateZOrder(
  doc: CanvasDocument,
  id: string,
  direction: 'forward' | 'backward' | 'front' | 'back'
): CanvasDocument {
  const idx = doc.zOrder.indexOf(id);
  if (idx === -1) return doc;

  const newZOrder = [...doc.zOrder];

  switch (direction) {
    case 'forward': {
      if (idx >= newZOrder.length - 1) return doc; // already at front
      // Swap with the element one position ahead
      [newZOrder[idx], newZOrder[idx + 1]] = [newZOrder[idx + 1], newZOrder[idx]];
      break;
    }

    case 'backward': {
      if (idx <= 0) return doc; // already at back
      // Swap with the element one position behind
      [newZOrder[idx], newZOrder[idx - 1]] = [newZOrder[idx - 1], newZOrder[idx]];
      break;
    }

    case 'front': {
      if (idx === newZOrder.length - 1) return doc; // already at front
      newZOrder.splice(idx, 1);
      newZOrder.push(id);
      break;
    }

    case 'back': {
      if (idx === 0) return doc; // already at back
      newZOrder.splice(idx, 1);
      newZOrder.unshift(id);
      break;
    }
  }

  return {
    ...doc,
    zOrder: newZOrder,
  };
}
