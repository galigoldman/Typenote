'use client';

import { Paperclip } from 'lucide-react';

interface FocusFilesButtonProps {
  count: number;
  isOpen: boolean;
  onClick: () => void;
}

/**
 * Labeled toolbar/header button that toggles the Focus files panel.
 * Shared by both editor headers (TipTap text editor + canvas editor) so the
 * entry point stays identical. The label collapses on very narrow screens,
 * leaving the icon + count badge.
 */
export function FocusFilesButton({
  count,
  isOpen,
  onClick,
}: FocusFilesButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid="focus-files-toggle"
      aria-pressed={isOpen}
      aria-label="Focus files"
      title="Focus files — the files the AI focuses on for this note"
      className={`flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm transition-colors ${
        isOpen
          ? 'bg-accent text-accent-foreground'
          : 'text-muted-foreground hover:bg-accent'
      }`}
    >
      <Paperclip className="h-4 w-4 shrink-0" />
      <span className="hidden sm:inline">Focus files</span>
      {count > 0 && (
        <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] text-primary-foreground">
          {count}
        </span>
      )}
    </button>
  );
}
