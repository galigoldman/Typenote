'use client';

import { useState } from 'react';
import { FileText, Paperclip, Plus, X } from 'lucide-react';
import {
  attachContextFile,
  detachContextFile,
} from '@/lib/actions/context-files';
import type {
  AttachableFile,
  ContextFileType,
  ResolvedContextFile,
} from '@/types/database';
import { AddFilesDialog } from './add-files-dialog';

/** Target for the read-only file viewer, opened from the panel or an AI citation. */
export interface ViewerTarget {
  fileType: ContextFileType;
  fileId: string;
  page?: number;
}

interface FocusFilesPanelProps {
  documentId: string;
  courseId: string;
  isOpen: boolean;
  onClose: () => void;
  /** The attached files — owned by the host so the panel and chat stay in sync. */
  files: ResolvedContextFile[];
  /** Called after an attach/detach so the host can reload the shared list. */
  onChanged: () => void | Promise<void>;
  onOpenFile: (file: { fileType: ContextFileType; fileId: string }) => void;
}

export function FocusFilesPanel({
  documentId,
  courseId,
  isOpen,
  onClose,
  files,
  onChanged,
  onOpenFile,
}: FocusFilesPanelProps) {
  const [dialogOpen, setDialogOpen] = useState(false);

  const handleDetach = async (f: ResolvedContextFile) => {
    await detachContextFile({
      documentId,
      fileType: f.fileType,
      fileId: f.fileId,
    });
    await onChanged();
  };

  // Attach the chosen files sequentially so a failure can name the file.
  // Always refresh so successful attachments stick even if a later one fails.
  const handleConfirm = async (selected: AttachableFile[]) => {
    const failed: string[] = [];
    for (const c of selected) {
      try {
        await attachContextFile({
          documentId,
          fileType: c.fileType,
          fileId: c.fileId,
        });
      } catch {
        failed.push(c.name);
      }
    }
    await onChanged();
    if (failed.length > 0) {
      throw new Error(`Couldn't add: ${failed.join(', ')}`);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      data-testid="context-files-panel"
      className="fixed inset-0 z-50 flex h-full w-full flex-col border-l bg-background shadow-xl lg:static lg:z-auto lg:w-[300px] lg:shrink-0"
    >
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Paperclip className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Focus files</h2>
        </div>
        <button
          onClick={onClose}
          aria-label="Close focus files"
          className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <p className="border-b px-4 py-2 text-xs text-muted-foreground">
        The AI focuses on these when answering. Click any file to open it here.
      </p>

      <div className="flex-1 overflow-y-auto p-2">
        {files.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">
            No focus files yet — the AI still uses everything in this course.
            Add the exercise sheet or slides to focus it.
          </p>
        ) : (
          files.map((f) => (
            <div
              key={`${f.fileType}:${f.fileId}`}
              className="group flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent"
            >
              <button
                onClick={() =>
                  onOpenFile({ fileType: f.fileType, fileId: f.fileId })
                }
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
                data-testid="context-file-item"
              >
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{f.name}</span>
              </button>
              <button
                onClick={() => handleDetach(f)}
                aria-label={`Remove ${f.name}`}
                className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 hover:bg-background group-hover:opacity-100"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))
        )}
      </div>

      <div className="border-t p-3">
        <button
          onClick={() => setDialogOpen(true)}
          data-testid="context-files-add"
          className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed py-2 text-sm text-muted-foreground hover:bg-accent"
        >
          <Plus className="h-4 w-4" /> Add files
        </button>
      </div>

      <AddFilesDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        courseId={courseId}
        alreadyAttached={files.map((f) => ({
          fileType: f.fileType,
          fileId: f.fileId,
        }))}
        onConfirm={handleConfirm}
      />
    </div>
  );
}
