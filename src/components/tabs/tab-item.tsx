'use client';

import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TabItemProps {
  documentId: string;
  title: string;
  isActive: boolean;
  onSwitch: (documentId: string) => void;
  onClose: (documentId: string) => void;
}

export function TabItem({
  documentId,
  title,
  isActive,
  onSwitch,
  onClose,
}: TabItemProps) {
  return (
    <div
      role="tab"
      aria-selected={isActive}
      tabIndex={0}
      className={cn(
        'group relative flex h-8 max-w-[180px] min-w-[100px] cursor-pointer items-center gap-1 rounded-t-md border border-b-0 border-transparent px-3 text-sm transition-colors select-none',
        isActive
          ? 'border-border/40 bg-background text-foreground shadow-sm'
          : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
      )}
      onClick={() => onSwitch(documentId)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSwitch(documentId);
        }
      }}
      data-testid="tab-item"
    >
      <span className="truncate flex-1 text-xs">{title || 'Untitled'}</span>
      <button
        type="button"
        className={cn(
          'ml-1 flex size-4 shrink-0 items-center justify-center rounded-sm transition-colors',
          'opacity-0 group-hover:opacity-100',
          isActive && 'opacity-100',
          'hover:bg-destructive/20 hover:text-destructive',
        )}
        onClick={(e) => {
          e.stopPropagation();
          onClose(documentId);
        }}
        aria-label={`Close ${title || 'Untitled'}`}
        data-testid="tab-close-button"
      >
        <X className="size-3" />
      </button>
    </div>
  );
}
