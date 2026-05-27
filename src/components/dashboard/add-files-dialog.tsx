'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, FileText, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getAttachableFiles } from '@/lib/actions/context-files';
import type { AttachableFile, ContextFileType } from '@/types/database';

interface AddFilesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courseId: string;
  alreadyAttached: { fileType: ContextFileType; fileId: string }[];
  /** Attach the selected files. Rejects (throws) if any failed. */
  onConfirm: (selected: AttachableFile[]) => Promise<void>;
}

type GroupKey = 'moodle' | 'course' | 'personal';

const GROUPS: { key: GroupKey; label: string }[] = [
  { key: 'moodle', label: 'From Moodle' },
  { key: 'course', label: 'Course materials' },
  { key: 'personal', label: 'Personal uploads' },
];

const fileKey = (f: { fileType: ContextFileType; fileId: string }) =>
  `${f.fileType}:${f.fileId}`;

export function AddFilesDialog({
  open,
  onOpenChange,
  courseId,
  alreadyAttached,
  onConfirm,
}: AddFilesDialogProps) {
  const [groups, setGroups] = useState<Record<GroupKey, AttachableFile[]>>({
    moodle: [],
    course: [],
    personal: [],
  });
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const attachedKeys = useMemo(
    () => new Set(alreadyAttached.map(fileKey)),
    [alreadyAttached],
  );

  // Load candidates whenever the dialog opens; reset transient state.
  useEffect(() => {
    if (!open) return;
    setSelected(new Set());
    setQuery('');
    setError(null);
    setLoading(true);
    getAttachableFiles(courseId)
      .then(({ moodleFiles, courseMaterials, personalFiles }) => {
        setGroups({
          moodle: moodleFiles,
          course: courseMaterials,
          personal: personalFiles,
        });
      })
      .catch(() => setError('Failed to load files'))
      .finally(() => setLoading(false));
  }, [open, courseId]);

  const allFiles = [...groups.moodle, ...groups.course, ...groups.personal];
  const selectedFiles = allFiles.filter((f) => selected.has(fileKey(f)));

  const matches = (f: AttachableFile) =>
    f.name.toLowerCase().includes(query.trim().toLowerCase());

  const toggle = (f: AttachableFile) => {
    const k = fileKey(f);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };

  const handleAdd = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm(selectedFiles);
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add files');
    } finally {
      setSubmitting(false);
    }
  };

  const isEmpty = !loading && allFiles.length === 0;
  const count = selectedFiles.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="add-files-dialog">
        <DialogHeader>
          <DialogTitle>Add focus files</DialogTitle>
          <DialogDescription>
            Pick imported files for the AI to focus on for this note. You can
            open them here too.
          </DialogDescription>
        </DialogHeader>

        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search files…"
          aria-label="Search files"
        />

        <div className="max-h-[320px] min-h-[120px] overflow-y-auto py-1">
          {loading ? (
            <p className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </p>
          ) : isEmpty ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No imported files in this course yet.
            </p>
          ) : (
            GROUPS.map(({ key, label }) => {
              const items = groups[key].filter(matches);
              if (items.length === 0) return null;
              return (
                <div key={key} className="mb-2">
                  <div className="px-1 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    {label}
                  </div>
                  {items.map((f) => {
                    const attached = attachedKeys.has(fileKey(f));
                    const checked = attached || selected.has(fileKey(f));
                    return (
                      <button
                        key={fileKey(f)}
                        type="button"
                        disabled={attached}
                        onClick={() => toggle(f)}
                        data-testid="context-files-candidate"
                        className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent disabled:opacity-50"
                      >
                        <span
                          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                            checked
                              ? 'border-primary bg-primary text-primary-foreground'
                              : 'border-input'
                          }`}
                        >
                          {checked && <Check className="h-3 w-3" />}
                        </span>
                        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="truncate">{f.name}</span>
                        {attached && (
                          <span className="ml-auto text-[10px] text-muted-foreground">
                            added
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleAdd}
            disabled={submitting || count === 0}
          >
            {submitting
              ? 'Adding…'
              : count === 0
                ? 'Add files'
                : `Add ${count} file${count === 1 ? '' : 's'}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
