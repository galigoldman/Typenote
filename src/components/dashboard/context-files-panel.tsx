'use client';

import { useCallback, useEffect, useState } from 'react';
import { FileText, Paperclip, Plus, X } from 'lucide-react';
import {
  attachContextFile,
  detachContextFile,
  getAttachableFiles,
  getContextFiles,
} from '@/lib/actions/context-files';
import type {
  AttachableFile,
  ContextFileType,
  ResolvedContextFile,
} from '@/types/database';

interface ContextFilesPanelProps {
  documentId: string;
  courseId: string;
  isOpen: boolean;
  onClose: () => void;
  onCountChange?: (count: number) => void;
  onOpenFile: (file: { fileType: ContextFileType; fileId: string }) => void;
}

export function ContextFilesPanel({
  documentId,
  courseId,
  isOpen,
  onClose,
  onCountChange,
  onOpenFile,
}: ContextFilesPanelProps) {
  const [files, setFiles] = useState<ResolvedContextFile[]>([]);
  const [picking, setPicking] = useState(false);
  const [candidates, setCandidates] = useState<AttachableFile[]>([]);
  const [loadingPicker, setLoadingPicker] = useState(false);

  const refresh = useCallback(async () => {
    const list = await getContextFiles(documentId);
    setFiles(list);
    onCountChange?.(list.length);
  }, [documentId, onCountChange]);

  useEffect(() => {
    if (isOpen) refresh();
  }, [isOpen, refresh]);

  const openPicker = useCallback(async () => {
    setPicking(true);
    setLoadingPicker(true);
    try {
      const { courseMaterials, personalFiles, moodleFiles } =
        await getAttachableFiles(courseId);
      setCandidates([...moodleFiles, ...courseMaterials, ...personalFiles]);
    } finally {
      setLoadingPicker(false);
    }
  }, [courseId]);

  const isAttached = (c: AttachableFile) =>
    files.some((f) => f.fileType === c.fileType && f.fileId === c.fileId);

  const handleAttach = async (c: AttachableFile) => {
    await attachContextFile({
      documentId,
      fileType: c.fileType,
      fileId: c.fileId,
    });
    await refresh();
  };

  const handleDetach = async (f: ResolvedContextFile) => {
    await detachContextFile({
      documentId,
      fileType: f.fileType,
      fileId: f.fileId,
    });
    await refresh();
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
          <h2 className="text-sm font-semibold">Context files</h2>
        </div>
        <button
          onClick={onClose}
          aria-label="Close context files"
          className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {files.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">
            No files attached — that&apos;s fine. The AI still answers using
            everything in this course. Attach the exercise sheet or slides to
            give it focused context.
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
        {!picking ? (
          <button
            onClick={openPicker}
            data-testid="context-files-add"
            className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed py-2 text-sm text-muted-foreground hover:bg-accent"
          >
            <Plus className="h-4 w-4" /> Add files
          </button>
        ) : (
          <div className="max-h-60 space-y-0.5 overflow-y-auto">
            {loadingPicker ? (
              <p className="py-3 text-center text-xs text-muted-foreground">
                Loading…
              </p>
            ) : candidates.length === 0 ? (
              <p className="py-3 text-center text-xs text-muted-foreground">
                No imported files in this course yet.
              </p>
            ) : (
              candidates.map((c) => (
                <button
                  key={`${c.fileType}:${c.fileId}`}
                  disabled={isAttached(c)}
                  onClick={() => handleAttach(c)}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent disabled:opacity-40"
                >
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{c.name}</span>
                  {isAttached(c) && (
                    <span className="ml-auto text-[10px] text-muted-foreground">
                      added
                    </span>
                  )}
                </button>
              ))
            )}
            <button
              onClick={() => setPicking(false)}
              className="mt-1 w-full rounded-md py-1.5 text-xs text-muted-foreground hover:bg-accent"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
