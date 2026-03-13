'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { importMoodleFile } from '@/lib/actions/course-materials';
import { toast } from 'sonner';

interface MoodleFileOption {
  id: string;
  file_name: string;
  storage_path: string | null;
  mime_type: string | null;
  file_size: number | null;
  sectionTitle: string;
}

interface MoodleImportPickerProps {
  weekId: string;
  courseId: string;
  category: 'material' | 'homework';
  moodleFiles: MoodleFileOption[];
}

export function MoodleImportPicker({
  weekId,
  courseId,
  category,
  moodleFiles,
}: MoodleImportPickerProps) {
  const [open, setOpen] = useState(false);
  const [importing, setImporting] = useState<string | null>(null);

  const storedFiles = moodleFiles.filter((f) => f.storage_path);

  if (storedFiles.length === 0) return null;

  async function handleImport(file: MoodleFileOption) {
    setImporting(file.id);
    try {
      await importMoodleFile({
        moodleFileId: file.id,
        weekId,
        courseId,
        category,
      });
      toast.success(`Imported "${file.file_name}"`);
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setImporting(null);
    }
  }

  // Group by section
  const sections = new Map<string, MoodleFileOption[]>();
  for (const f of storedFiles) {
    const group = sections.get(f.sectionTitle) ?? [];
    group.push(f);
    sections.set(f.sectionTitle, group);
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="text-muted-foreground"
        onClick={() => setOpen(true)}
      >
        <Download className="size-4" />
        Import from Moodle
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md" style={{ maxHeight: '70vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <DialogHeader style={{ flexShrink: 0 }}>
            <DialogTitle>Import from Moodle</DialogTitle>
            <DialogDescription>
              Pick a synced file to add as {category === 'homework' ? 'homework' : 'material'}
            </DialogDescription>
          </DialogHeader>
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }} className="space-y-3">
            {[...sections.entries()].map(([title, files]) => (
              <div key={title}>
                <h4 className="mb-1 text-xs font-medium text-muted-foreground">{title}</h4>
                <div className="space-y-1">
                  {files.map((file) => (
                    <button
                      key={file.id}
                      onClick={() => handleImport(file)}
                      disabled={importing !== null}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent/50 disabled:opacity-50"
                    >
                      <span className="flex-1 truncate">{file.file_name}</span>
                      {file.file_size && (
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {file.file_size > 1024 * 1024
                            ? `${(file.file_size / (1024 * 1024)).toFixed(1)} MB`
                            : `${Math.round(file.file_size / 1024)} KB`}
                        </span>
                      )}
                      {importing === file.id && (
                        <span className="shrink-0 text-xs text-muted-foreground">...</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
