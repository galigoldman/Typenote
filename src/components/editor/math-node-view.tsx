'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { NodeViewWrapper } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import katex from 'katex';
import { translateMathToLatex } from '@/lib/editor/math-api';

type InputMode = 'nl' | 'latex';

export function MathNodeView({ node, updateAttributes, deleteNode, selected, editor }: NodeViewProps) {
  const { latex, naturalLanguage } = node.attrs;
  const isNew = !latex;

  const [editing, setEditing] = useState(isNew);
  const [inputMode, setInputMode] = useState<InputMode>('nl');
  const [inputValue, setInputValue] = useState(naturalLanguage || latex || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      // Use requestAnimationFrame to focus after Tiptap/ProseMirror finishes its focus cycle
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
  }, [editing]);

  const handleSubmit = useCallback(async () => {
    const value = inputValue.trim();
    if (!value) {
      if (isNew) deleteNode();
      return;
    }

    if (inputMode === 'latex') {
      updateAttributes({ latex: value, naturalLanguage: naturalLanguage || '' });
      // Flush save immediately so content persists through page refresh
      editor.storage?.inlineMath?.flushSave?.();
      setEditing(false);
      setError(null);
      return;
    }

    // NL mode: call API
    setLoading(true);
    setError(null);
    try {
      const result = await translateMathToLatex(value);
      updateAttributes({ latex: result, naturalLanguage: value });
      // Flush save immediately so content persists through page refresh
      editor.storage?.inlineMath?.flushSave?.();
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Translation failed');
    } finally {
      setLoading(false);
    }
  }, [inputValue, inputMode, isNew, deleteNode, updateAttributes, naturalLanguage]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSubmit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        if (isNew) {
          deleteNode();
        } else {
          setEditing(false);
          setInputValue(naturalLanguage || latex || '');
          setError(null);
        }
      }
    },
    [handleSubmit, isNew, deleteNode, naturalLanguage, latex]
  );

  const handleClick = useCallback(() => {
    if (!editing) {
      setEditing(true);
      setInputMode('nl');
      setInputValue(naturalLanguage || latex || '');
      setError(null);
    }
  }, [editing, naturalLanguage, latex]);

  const toggleMode = useCallback(() => {
    const newMode = inputMode === 'nl' ? 'latex' : 'nl';
    setInputMode(newMode);
    setInputValue(newMode === 'nl' ? naturalLanguage || '' : latex || '');
  }, [inputMode, naturalLanguage, latex]);

  if (editing) {
    return (
      <NodeViewWrapper as="span" className="inline">
        <span className="inline-flex items-center gap-1 rounded border border-blue-300 bg-blue-50 px-1 py-0.5 align-baseline">
          <button
            type="button"
            onClick={toggleMode}
            className="shrink-0 rounded px-1 text-[10px] font-medium text-blue-600 hover:bg-blue-100"
            contentEditable={false}
            title={inputMode === 'nl' ? 'Switch to LaTeX mode' : 'Switch to Natural Language mode'}
          >
            {inputMode === 'nl' ? 'NL' : 'TeX'}
          </button>
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={inputMode === 'nl' ? 'Type math in words...' : 'Raw LaTeX...'}
            className="min-w-[120px] border-none bg-transparent text-sm outline-none"
            disabled={loading}
          />
          {loading && (
            <span className="shrink-0 text-[10px] text-blue-500" contentEditable={false}>
              ...
            </span>
          )}
        </span>
        {error && (
          <span className="ml-1 text-[10px] text-red-500" contentEditable={false}>
            {error}
          </span>
        )}
      </NodeViewWrapper>
    );
  }

  // Display mode: render KaTeX
  const renderedHtml = katex.renderToString(latex || '', {
    throwOnError: false,
    displayMode: false,
  });

  return (
    <NodeViewWrapper as="span" className="inline">
      <span
        onClick={handleClick}
        className={`inline cursor-pointer rounded px-0.5 hover:bg-blue-50 ${selected ? 'bg-blue-100' : ''}`}
        contentEditable={false}
        dangerouslySetInnerHTML={{ __html: renderedHtml }}
      />
    </NodeViewWrapper>
  );
}
