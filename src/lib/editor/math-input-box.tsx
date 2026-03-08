'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface MathInputBoxProps {
  position: { x: number; y: number };
  onSubmit: (text: string) => Promise<void>;
  onCancel: () => void;
}

export function MathInputBox({
  position,
  onSubmit,
  onCancel,
}: MathInputBoxProps) {
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Auto-focus the input on mount, delayed to ensure ProseMirror's focus cycle completes
    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  }, []);

  const handleKeyDown = useCallback(
    async (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
        return;
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        const trimmed = inputValue.trim();
        if (!trimmed) {
          onCancel();
          return;
        }
        setIsLoading(true);
        try {
          await onSubmit(trimmed);
        } catch {
          setIsLoading(false);
        }
      }
    },
    [inputValue, onSubmit, onCancel],
  );

  return (
    <div
      style={{
        position: 'fixed',
        left: `${position.x}px`,
        top: `${position.y}px`,
        zIndex: 50,
      }}
      className="flex items-center gap-2 rounded-lg border border-violet-400 bg-white px-3 py-2 shadow-lg dark:bg-zinc-900"
    >
      <span className="text-sm font-medium text-violet-500">∑</span>
      <input
        ref={inputRef}
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Describe math in plain English..."
        disabled={isLoading}
        className="min-w-[220px] border-none bg-transparent text-sm outline-none placeholder:text-zinc-400 disabled:opacity-50"
      />
      {isLoading ? (
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-violet-500" />
      ) : (
        <span className="whitespace-nowrap text-xs text-zinc-400">
          <kbd className="rounded border border-zinc-300 px-1 text-[10px] dark:border-zinc-600">
            Enter
          </kbd>{' '}
          convert
        </span>
      )}
    </div>
  );
}
