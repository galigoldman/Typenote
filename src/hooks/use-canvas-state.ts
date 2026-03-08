'use client';

import { useCallback, useState } from 'react';

import type { Document } from '@/types/database';
import type {
  CanvasDocument,
  CanvasElement,
  CanvasBackground,
  ElementMap,
} from '@/lib/canvas/types';
import { createCanvasDocument } from '@/lib/canvas/types';
import {
  addElement as addElementOp,
  removeElement as removeElementOp,
  moveElement as moveElementOp,
  resizeElement as resizeElementOp,
} from '@/lib/canvas/element-operations';

function parseCanvasContent(content: Record<string, unknown>): CanvasDocument {
  if (content.format === 'canvas') {
    return content as unknown as CanvasDocument;
  }

  // Auto-migrate legacy linear (TipTap) documents into a canvas with a text block
  const canvasDoc = createCanvasDocument();
  if (content.type === 'doc' && content.content) {
    const id = crypto.randomUUID();
    canvasDoc.elements[id] = {
      type: 'text-block',
      x: 100,
      y: 80,
      width: 700,
      height: 500,
      zOrder: 0,
      content: content as Record<string, unknown>,
    };
    canvasDoc.zOrder.push(id);
  }
  return canvasDoc;
}

export function useCanvasState(document: Document) {
  const [canvasDoc, setCanvasDoc] = useState<CanvasDocument>(() =>
    parseCanvasContent(document.content)
  );
  const [isDirty, setIsDirty] = useState(false);

  const update = useCallback((updater: (prev: CanvasDocument) => CanvasDocument) => {
    setCanvasDoc(updater);
    setIsDirty(true);
  }, []);

  const addElement = useCallback(
    (id: string, element: CanvasElement) => {
      update((prev) => addElementOp(prev, id, element));
    },
    [update]
  );

  const updateElement = useCallback(
    (id: string, updates: Partial<CanvasElement>) => {
      update((prev) => {
        const existing = prev.elements[id];
        if (!existing) return prev;
        const merged = { ...existing, ...updates } as CanvasElement;
        return {
          ...prev,
          elements: { ...prev.elements, [id]: merged },
        };
      });
    },
    [update]
  );

  const removeElement = useCallback(
    (id: string) => {
      update((prev) => removeElementOp(prev, id));
    },
    [update]
  );

  const moveElement = useCallback(
    (id: string, x: number, y: number) => {
      update((prev) => moveElementOp(prev, id, x, y));
    },
    [update]
  );

  const resizeElement = useCallback(
    (id: string, width: number, height: number) => {
      update((prev) => resizeElementOp(prev, id, width, height));
    },
    [update]
  );

  const setBackground = useCallback(
    (bg: CanvasBackground) => {
      update((prev) => ({ ...prev, background: bg }));
    },
    [update]
  );

  const elements: ElementMap = canvasDoc.elements;
  const background: CanvasBackground = canvasDoc.background;

  return {
    canvasDoc,
    elements,
    background,
    addElement,
    updateElement,
    removeElement,
    moveElement,
    resizeElement,
    setBackground,
    isDirty,
  };
}
