'use client';

import { useState } from 'react';
import { FileText, Info, Paperclip, Plus, X } from 'lucide-react';
import {
  attachContextFile,
  detachContextFile,
} from '@/lib/actions/context-files';
import type {
  AttachableFile,
  ContextFileType,
  ResolvedContextFile,
} from '@/types/database';
import { AddFilesDialog } from '@/components/dashboard/add-files-dialog';

/** How many chips to show before collapsing the rest behind "+N more". */
const MAX_VISIBLE = 4;

interface ChatFocusFilesProps {
  documentId: string;
  courseId: string;
  /** Attached files — owned by the host so chat + side panel stay in sync. */
  files: ResolvedContextFile[];
  /** Called after attach/detach so the host can reload the shared list. */
  onChanged: () => void | Promise<void>;
  onOpenFile?: (file: { fileType: ContextFileType; fileId: string }) => void;
}

/**
 * Compact focus-files control shown inside the AI chat, above the input.
 * Lets the user see and pick the files the AI focuses on for this note,
 * without leaving the chat. Manages the same per-document focus files as
 * the side panel (single source of truth via the host).
 */
export function ChatFocusFiles({
  documentId,
  courseId,
  files,
  onChanged,
  onOpenFile,
}: ChatFocusFilesProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const handleDetach = async (f: ResolvedContextFile) => {
    await detachContextFile({
      documentId,
      fileType: f.fileType,
      fileId: f.fileId,
    });
    await onChanged();
  };

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

  const visible = showAll ? files : files.slice(0, MAX_VISIBLE);
  const hiddenCount = files.length - visible.length;

  return (
    <div data-testid="chat-focus-files" className="mb-2">
      <div className="mb-1 flex items-center gap-1 text-xs font-medium text-muted-foreground">
        <Paperclip className="h-3 w-3" />
        {files.length > 0 ? 'Focusing on' : 'Focus files'}
        <span
          title="The AI prioritizes these files when answering in this chat. It still uses everything in the course too."
          className="inline-flex cursor-help items-center"
        >
          <Info className="h-3 w-3 opacity-70" />
        </span>
      </div>

      {files.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Add files for the AI to focus on for this note.{' '}
          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            data-testid="chat-focus-add"
            className="font-medium text-[#6355C0] hover:underline"
          >
            + Add files
          </button>
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-1.5">
          {visible.map((f) => (
            <span
              key={`${f.fileType}:${f.fileId}`}
              data-testid="chat-focus-chip"
              className="inline-flex max-w-[170px] items-center gap-1 rounded-full border bg-muted/50 py-0.5 pl-2 pr-1 text-xs"
            >
              <button
                type="button"
                onClick={() =>
                  onOpenFile?.({ fileType: f.fileType, fileId: f.fileId })
                }
                className="flex min-w-0 items-center gap-1"
                title={f.name}
              >
                <FileText className="h-3 w-3 shrink-0 text-muted-foreground" />
                <span className="truncate">{f.name}</span>
              </button>
              <button
                type="button"
                onClick={() => handleDetach(f)}
                aria-label={`Remove ${f.name}`}
                className="shrink-0 rounded-full p-0.5 text-muted-foreground hover:bg-background"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}

          {hiddenCount > 0 && !showAll && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent"
            >
              +{hiddenCount} more
            </button>
          )}
          {showAll && files.length > MAX_VISIBLE && (
            <button
              type="button"
              onClick={() => setShowAll(false)}
              className="rounded-full px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent"
            >
              show less
            </button>
          )}

          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            data-testid="chat-focus-add"
            className="inline-flex items-center gap-0.5 rounded-full border border-dashed px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent"
          >
            <Plus className="h-3 w-3" /> Add
          </button>
        </div>
      )}

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
