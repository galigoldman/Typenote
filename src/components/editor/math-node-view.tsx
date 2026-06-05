'use client';

import { createPortal } from 'react-dom';
import { NodeViewWrapper } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import type { EditorView } from '@tiptap/pm/view';
import katex from 'katex';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type EditMode = 'expression' | 'latex';

export function MathNodeView({
  node,
  updateAttributes,
  selected,
  editor,
  getPos,
}: NodeViewProps) {
  const latex = node.attrs.latex as string;
  const originalText = (node.attrs.originalText as string) || '';

  const [isEditing, setIsEditing] = useState(false);
  const [editMode, setEditMode] = useState<EditMode>('expression');
  const [editValue, setEditValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [menuPos, setMenuPos] = useState<{
    left: number;
    top: number;
  } | null>(null);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLSpanElement>(null);

  const html = useMemo(() => {
    if (!latex) return '';
    try {
      return katex.renderToString(latex, {
        throwOnError: false,
        displayMode: false,
      });
    } catch {
      return `<span style="color: red;">${latex}</span>`;
    }
  }, [latex]);

  // Compute menu position when selected or editing
  useEffect(() => {
    if ((selected || isEditing) && wrapperRef.current) {
      const rect = wrapperRef.current.getBoundingClientRect();
      setMenuPos({ left: rect.left, top: rect.bottom + 4 });
    } else {
      setMenuPos(null);
    }
  }, [selected, isEditing]);

  const openEditor = useCallback(() => {
    setIsEditing(true);
    setEditMode('expression');
    setEditValue(originalText);
    setError(null);
    setIsLoading(false);
  }, [originalText]);

  const closeEditor = useCallback(() => {
    setIsEditing(false);
    setEditValue('');
    setError(null);
    setIsLoading(false);
  }, []);

  const handleCopy = useCallback(async () => {
    const pos = typeof getPos === 'function' ? getPos() : undefined;
    if (pos === undefined || !editor) return;

    const slice = editor.state.doc.slice(pos, pos + node.nodeSize);
    // serializeForClipboard is available on EditorView but not in TipTap's type exports
    const { dom } = (
      editor.view as EditorView & {
        serializeForClipboard: (s: typeof slice) => {
          dom: HTMLElement;
          text: string;
        };
      }
    ).serializeForClipboard(slice);

    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([dom.innerHTML], { type: 'text/html' }),
          'text/plain': new Blob([node.attrs.latex as string], {
            type: 'text/plain',
          }),
        }),
      ]);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Fallback: try plain text only
      try {
        await navigator.clipboard.writeText(node.attrs.latex as string);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      } catch {
        // Clipboard API not available
      }
    }
  }, [editor, getPos, node]);

  const switchMode = useCallback(
    (mode: EditMode) => {
      setEditMode(mode);
      setEditValue(mode === 'expression' ? originalText : latex);
      setError(null);
    },
    [originalText, latex],
  );

  const resizeTextarea = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  }, []);

  // Auto-focus input when edit panel opens or mode switches
  useEffect(() => {
    if (isEditing) {
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        resizeTextarea();
      });
    }
  }, [isEditing, editMode, resizeTextarea]);

  // Auto-resize textarea when content or mode changes
  useEffect(() => {
    if (isEditing) {
      resizeTextarea();
    }
  }, [editValue, editMode, isEditing, resizeTextarea]);

  // Click outside to close
  useEffect(() => {
    if (!isEditing) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        closeEditor();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isEditing, closeEditor]);

  const handleKeyDown = useCallback(
    async (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closeEditor();
        return;
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        if (isLoading) return;

        const trimmed = editValue.trim();

        if (editMode === 'latex') {
          if (trimmed && trimmed !== latex) {
            updateAttributes({ latex: trimmed });
          }
          closeEditor();
          return;
        }

        // Expression mode
        if (!trimmed || trimmed === originalText) {
          closeEditor();
          return;
        }

        // Text changed — call AI
        setIsLoading(true);
        setError(null);
        try {
          const res = await fetch('/api/ai/latex', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: trimmed }),
          });
          if (!res.ok) {
            throw new Error('Conversion failed');
          }
          const data = await res.json();
          updateAttributes({ latex: data.latex, originalText: trimmed });
          closeEditor();
        } catch {
          setError('Failed to convert expression');
          setIsLoading(false);
        }
      }
    },
    [
      editValue,
      editMode,
      isLoading,
      latex,
      originalText,
      updateAttributes,
      closeEditor,
    ],
  );

  return (
    <NodeViewWrapper
      as="span"
      className="math-expression-node"
      style={{
        display: 'inline',
        position: 'relative',
        borderRadius: '4px',
        padding: '1px 4px',
        cursor: 'default',
        ...(selected
          ? {
              outline: '2px solid #8b5cf6',
              backgroundColor: 'rgba(139, 92, 246, 0.1)',
            }
          : {}),
      }}
    >
      <span ref={wrapperRef} dangerouslySetInnerHTML={{ __html: html }} />
      {selected &&
        !isEditing &&
        menuPos &&
        createPortal(
          <div
            style={{
              position: 'fixed',
              left: menuPos.left,
              top: menuPos.top,
              zIndex: 9999,
            }}
            className="flex gap-1 rounded-lg border border-zinc-300 bg-white p-1 shadow-lg dark:border-zinc-600 dark:bg-zinc-900"
          >
            {/* preventDefault on mouseDown keeps ProseMirror NodeSelection active */}
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={openEditor}
              className="rounded px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Edit
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={handleCopy}
              className="rounded px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>,
          document.body,
        )}
      {isEditing &&
        menuPos &&
        createPortal(
          <div
            ref={panelRef}
            style={{
              position: 'fixed',
              left: menuPos.left,
              top: menuPos.top,
              zIndex: 9999,
            }}
            className="flex flex-col gap-2 rounded-lg border border-zinc-300 bg-white p-2 shadow-lg dark:border-zinc-600 dark:bg-zinc-900"
          >
            {/* Mode selector */}
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => switchMode('expression')}
                className={`rounded px-2 py-0.5 text-xs font-medium ${
                  editMode === 'expression'
                    ? 'bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-300'
                    : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                }`}
              >
                Edit Expression
              </button>
              <button
                type="button"
                onClick={() => switchMode('latex')}
                className={`rounded px-2 py-0.5 text-xs font-medium ${
                  editMode === 'latex'
                    ? 'bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-300'
                    : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                }`}
              >
                Edit LaTeX
              </button>
            </div>
            {/* Input */}
            <div className="flex items-center gap-2">
              <textarea
                ref={inputRef}
                rows={1}
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  editMode === 'expression'
                    ? 'Describe math in plain English...'
                    : 'Enter LaTeX code...'
                }
                disabled={isLoading}
                className="min-w-[220px] max-h-[200px] resize-none overflow-y-auto border-none bg-transparent text-sm outline-none placeholder:text-zinc-400 disabled:opacity-50"
              />
              {isLoading && (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-violet-500" />
              )}
            </div>
            {/* Error message */}
            {error && <span className="text-xs text-red-500">{error}</span>}
          </div>,
          document.body,
        )}
    </NodeViewWrapper>
  );
}
