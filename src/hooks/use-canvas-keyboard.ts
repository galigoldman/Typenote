'use client';

import { useCallback, useEffect, useRef } from 'react';
import { v4 as uuid } from 'uuid';
import type { CanvasDocument, CanvasElement } from '@/lib/canvas/types';
import { updateZOrder } from '@/lib/canvas/element-operations';

interface UseCanvasKeyboardOptions {
  selectedIds: Set<string>;
  canvasDoc: CanvasDocument;
  onRemoveElement: (id: string) => void;
  onAddElement: (id: string, element: CanvasElement) => void;
  onClearSelection: () => void;
  onSelectAll: (ids: string[]) => void;
  onUndo?: () => void;
  onRedo?: () => void;
}

/**
 * Canvas keyboard shortcuts:
 * - Ctrl+Z / Cmd+Z: Undo
 * - Ctrl+Shift+Z / Cmd+Shift+Z: Redo
 * - Delete/Backspace: Delete selected (when not in editor)
 * - Escape: Deselect
 * - Ctrl+A / Cmd+A: Select all
 * - Ctrl+D / Cmd+D: Duplicate selected
 * - Ctrl+C / Cmd+C: Copy selected
 * - Ctrl+V / Cmd+V: Paste
 * - Ctrl+] / Cmd+]: Bring forward
 * - Ctrl+[ / Cmd+[: Send backward
 */
export function useCanvasKeyboard({
  selectedIds,
  canvasDoc,
  onRemoveElement,
  onAddElement,
  onClearSelection,
  onSelectAll,
  onUndo,
  onRedo,
}: UseCanvasKeyboardOptions) {
  const clipboardRef = useRef<Map<string, CanvasElement>>(new Map());

  const isModKey = useCallback((e: KeyboardEvent) => {
    return e.metaKey || e.ctrlKey;
  }, []);

  const isInsideEditor = useCallback(() => {
    const active = document.activeElement;
    return active && active.closest('.ProseMirror');
  }, []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Don't intercept when typing in a TipTap editor
      if (isInsideEditor()) return;

      // Undo
      if (isModKey(e) && !e.shiftKey && e.key === 'z') {
        e.preventDefault();
        onUndo?.();
        return;
      }

      // Redo
      if (isModKey(e) && e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        onRedo?.();
        return;
      }

      // Delete selected
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.size > 0) {
        e.preventDefault();
        for (const id of selectedIds) {
          onRemoveElement(id);
        }
        onClearSelection();
        return;
      }

      // Escape — deselect
      if (e.key === 'Escape') {
        onClearSelection();
        return;
      }

      // Select all
      if (isModKey(e) && e.key === 'a') {
        e.preventDefault();
        const allIds = Object.keys(canvasDoc.elements).filter(
          (id) => canvasDoc.elements[id].type === 'text-block',
        );
        onSelectAll(allIds);
        return;
      }

      // Copy
      if (isModKey(e) && e.key === 'c' && selectedIds.size > 0) {
        e.preventDefault();
        clipboardRef.current.clear();
        for (const id of selectedIds) {
          const el = canvasDoc.elements[id];
          if (el) {
            clipboardRef.current.set(id, structuredClone(el));
          }
        }
        return;
      }

      // Paste
      if (isModKey(e) && e.key === 'v' && clipboardRef.current.size > 0) {
        e.preventDefault();
        const newIds: string[] = [];
        for (const [, el] of clipboardRef.current) {
          const newId = uuid();
          const pasted: CanvasElement = {
            ...structuredClone(el),
            x: el.x + 20,
            y: el.y + 20,
          };
          onAddElement(newId, pasted);
          newIds.push(newId);
        }
        onSelectAll(newIds);
        return;
      }

      // Duplicate
      if (isModKey(e) && e.key === 'd' && selectedIds.size > 0) {
        e.preventDefault();
        const newIds: string[] = [];
        for (const id of selectedIds) {
          const el = canvasDoc.elements[id];
          if (el) {
            const newId = uuid();
            const dup: CanvasElement = {
              ...structuredClone(el),
              x: el.x + 20,
              y: el.y + 20,
            };
            onAddElement(newId, dup);
            newIds.push(newId);
          }
        }
        onSelectAll(newIds);
        return;
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    selectedIds,
    canvasDoc,
    onRemoveElement,
    onAddElement,
    onClearSelection,
    onSelectAll,
    onUndo,
    onRedo,
    isModKey,
    isInsideEditor,
  ]);
}
