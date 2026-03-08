'use client';

import { NodeViewWrapper } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import katex from 'katex';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type EditMode = 'expression' | 'latex';

export function MathNodeView({ node, updateAttributes }: NodeViewProps) {
  const latex = node.attrs.latex as string;
  const originalText = (node.attrs.originalText as string) || '';

  const [isEditing, setIsEditing] = useState(false);
  const [editMode, setEditMode] = useState<EditMode>('expression');
  const [editValue, setEditValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

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

  const switchMode = useCallback(
    (mode: EditMode) => {
      setEditMode(mode);
      setEditValue(mode === 'expression' ? originalText : latex);
      setError(null);
    },
    [originalText, latex],
  );

  // Auto-focus input when edit panel opens or mode switches
  useEffect(() => {
    if (isEditing) {
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
  }, [isEditing, editMode]);

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
    async (e: React.KeyboardEvent<HTMLInputElement>) => {
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
        cursor: 'pointer',
      }}
    >
      <span dangerouslySetInnerHTML={{ __html: html }} onClick={openEditor} />
      {isEditing && (
        <div
          ref={panelRef}
          style={{
            position: 'absolute',
            left: 0,
            top: '100%',
            zIndex: 50,
            marginTop: '4px',
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
            <input
              ref={inputRef}
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                editMode === 'expression'
                  ? 'Describe math in plain English...'
                  : 'Enter LaTeX code...'
              }
              disabled={isLoading}
              className="min-w-[220px] border-none bg-transparent text-sm outline-none placeholder:text-zinc-400 disabled:opacity-50"
            />
            {isLoading && (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-violet-500" />
            )}
          </div>
          {/* Error message */}
          {error && <span className="text-xs text-red-500">{error}</span>}
        </div>
      )}
    </NodeViewWrapper>
  );
}
