'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { NodeViewWrapper } from '@tiptap/react';
import katex from 'katex';
import { translateMathToLatex } from '@/lib/editor/math-api';

export interface MathNodeViewProps {
  node: { attrs: { latex: string; naturalLanguage: string } };
  updateAttributes: (
    attrs: Partial<{ latex: string; naturalLanguage: string }>,
  ) => void;
  deleteNode: () => void;
  selected: boolean;
}

export function MathNodeView({
  node,
  updateAttributes,
  deleteNode,
  selected,
}: MathNodeViewProps) {
  const { latex, naturalLanguage } = node.attrs;
  const isNewNode = latex === '';

  const [isEditing, setIsEditing] = useState(isNewNode);
  const [inputValue, setInputValue] = useState(
    isNewNode ? '' : naturalLanguage || '',
  );
  const [isLatexMode, setIsLatexMode] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const originalNL = useRef(naturalLanguage);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isEditing]);

  const handleEnterEdit = useCallback(() => {
    originalNL.current = naturalLanguage;
    setIsEditing(true);
    setInputValue(naturalLanguage || '');
    setIsLatexMode(false);
    setError(null);
  }, [naturalLanguage]);

  const handleSubmit = useCallback(async () => {
    const value = inputValue.trim();
    if (!value) return;

    if (isLatexMode) {
      // In LaTeX mode, update directly without AI call
      updateAttributes({
        latex: value,
        naturalLanguage: originalNL.current,
      });
      setIsEditing(false);
      setError(null);
      return;
    }

    // NL mode: skip AI if text hasn't changed
    if (value === originalNL.current && latex !== '') {
      setIsEditing(false);
      setError(null);
      return;
    }

    // NL mode: call AI
    setIsLoading(true);
    setError(null);
    try {
      const result = await translateMathToLatex(value);
      updateAttributes({
        latex: result,
        naturalLanguage: value,
      });
      setIsEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Translation failed');
    } finally {
      setIsLoading(false);
    }
  }, [inputValue, isLatexMode, latex, originalNL, updateAttributes]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        handleSubmit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (isNewNode && latex === '') {
          deleteNode();
        } else {
          setIsEditing(false);
          setError(null);
        }
      }
    },
    [handleSubmit, isNewNode, latex, deleteNode],
  );

  const handleToggleMode = useCallback(() => {
    setIsLatexMode((prev) => {
      const next = !prev;
      setInputValue(next ? latex : naturalLanguage || '');
      return next;
    });
  }, [latex, naturalLanguage]);

  if (isEditing) {
    return (
      <NodeViewWrapper as="span" className="inline">
        <span className="inline-flex items-center gap-1 rounded border border-border bg-muted px-1 py-0.5 text-sm">
          <input
            ref={inputRef}
            type="text"
            className="min-w-[120px] border-none bg-transparent text-sm outline-none"
            placeholder={isLatexMode ? 'LaTeX...' : 'Describe math...'}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          {isLoading && (
            <span className="text-xs text-muted-foreground">...</span>
          )}
          {error && <span className="text-xs text-destructive">{error}</span>}
          {!isNewNode && (
            <button
              type="button"
              aria-label={isLatexMode ? 'NL' : 'LaTeX'}
              className="rounded px-1 text-xs text-muted-foreground hover:text-foreground"
              onClick={handleToggleMode}
            >
              {isLatexMode ? 'NL' : 'LaTeX'}
            </button>
          )}
        </span>
      </NodeViewWrapper>
    );
  }

  // Display mode: render KaTeX
  const html = katex.renderToString(latex, {
    throwOnError: false,
  });

  return (
    <NodeViewWrapper as="span" className="inline">
      <span
        className={`cursor-pointer rounded px-0.5 ${selected ? 'ring-2 ring-ring' : ''}`}
        onClick={handleEnterEdit}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            handleEnterEdit();
          }
        }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </NodeViewWrapper>
  );
}
