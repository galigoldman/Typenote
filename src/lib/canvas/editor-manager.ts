'use client';

import {
  createContext,
  useContext,
  useRef,
  useEffect,
  createElement,
} from 'react';
import type { Editor } from '@tiptap/react';

/**
 * EditorManager — a registry of active TipTap editor instances on the canvas.
 *
 * Each text block owns one Editor. The manager provides O(1) lookup by element
 * ID and a convenience method to find whichever editor currently holds focus.
 */
export class EditorManager {
  private editors: Map<string, Editor> = new Map();

  /** Add an editor to the registry, keyed by its canvas element ID. */
  register(elementId: string, editor: Editor): void {
    this.editors.set(elementId, editor);
  }

  /** Remove an editor from the registry. */
  unregister(elementId: string): void {
    this.editors.delete(elementId);
  }

  /** Retrieve an editor by its canvas element ID. */
  get(elementId: string): Editor | undefined {
    return this.editors.get(elementId);
  }

  /** Return the editor that currently has focus, or `undefined` if none do. */
  getFocused(): Editor | undefined {
    for (const editor of this.editors.values()) {
      if (editor.isFocused) {
        return editor;
      }
    }
    return undefined;
  }

  /** Return the full internal map (read-only intent; callers should not mutate). */
  getAll(): Map<string, Editor> {
    return this.editors;
  }

  /** Destroy every registered editor and clear the registry. */
  destroy(): void {
    for (const editor of this.editors.values()) {
      editor.destroy();
    }
    this.editors.clear();
  }
}

// ---------------------------------------------------------------------------
// React Context + hook
// ---------------------------------------------------------------------------

const EditorManagerContext = createContext<EditorManager | null>(null);

/**
 * Provides a single EditorManager instance to the subtree.
 * The manager is created once on mount and destroyed on unmount.
 */
export function EditorManagerProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const managerRef = useRef<EditorManager | null>(null);

  if (managerRef.current === null) {
    managerRef.current = new EditorManager();
  }

  useEffect(() => {
    return () => {
      managerRef.current?.destroy();
    };
  }, []);

  return createElement(
    EditorManagerContext.Provider,
    { value: managerRef.current },
    children,
  );
}

/**
 * Access the EditorManager from any component inside an EditorManagerProvider.
 * Throws if used outside the provider to surface wiring mistakes early.
 */
export function useEditorManager(): EditorManager {
  const manager = useContext(EditorManagerContext);
  if (manager === null) {
    throw new Error(
      'useEditorManager must be used within an <EditorManagerProvider>',
    );
  }
  return manager;
}
