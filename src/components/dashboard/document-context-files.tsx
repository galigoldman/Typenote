'use client';

import { useState } from 'react';
import { Paperclip } from 'lucide-react';
import { ContextFilesPanel } from './context-files-panel';
import type { ContextFileType } from '@/types/database';

export interface ViewerTarget {
  fileType: ContextFileType;
  fileId: string;
  page?: number;
}

interface DocumentContextFilesProps {
  documentId: string;
  courseId: string;
  onOpenFile: (t: ViewerTarget) => void;
}

export function DocumentContextFiles({
  documentId,
  courseId,
  onOpenFile,
}: DocumentContextFilesProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [count, setCount] = useState(0);

  return (
    <>
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          data-testid="context-files-toggle"
          aria-label="Context files"
          className="fixed z-40 flex items-center justify-center rounded-full border bg-background shadow-lg hover:bg-accent"
          style={{ bottom: 72, right: 64, width: 44, height: 44 }}
        >
          <Paperclip className="h-5 w-5" />
          {count > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] text-primary-foreground">
              {count}
            </span>
          )}
        </button>
      )}
      <ContextFilesPanel
        documentId={documentId}
        courseId={courseId}
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        onCountChange={setCount}
        onOpenFile={(f) =>
          onOpenFile({ fileType: f.fileType, fileId: f.fileId })
        }
      />
    </>
  );
}
