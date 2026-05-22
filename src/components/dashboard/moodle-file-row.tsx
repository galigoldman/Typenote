'use client';

import { useTransition } from 'react';
import { Trash2 } from 'lucide-react';

import { removeMoodleFileFromNotebook } from '@/lib/actions/moodle-sync';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface MoodleFileRowProps {
  fileId: string;
  fileName: string;
  fileType: string; // 'file' | 'link'
  mimeType: string | null;
  fileSize: number | null;
  href: string;
  isStored: boolean;
  courseId: string;
}

export function MoodleFileRow({
  fileId,
  fileName,
  fileType,
  mimeType,
  fileSize,
  href,
  isStored,
  courseId,
}: MoodleFileRowProps) {
  const [isPending, startTransition] = useTransition();

  const handleDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const confirmed = window.confirm(
      `Remove "${fileName}" from your materials? The file stays in the shared registry; only your access record is removed.`,
    );
    if (!confirmed) return;
    startTransition(async () => {
      try {
        await removeMoodleFileFromNotebook(fileId, courseId);
      } catch (err) {
        // eslint-disable-next-line no-alert
        alert(
          `Failed to remove file: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    });
  };

  return (
    <a
      href={href}
      data-moodle-file-row=""
      data-file-id={fileId}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 px-4 py-2 hover:bg-accent/30 transition-colors"
      {...(isStored ? { download: fileName } : {})}
    >
      <span className="flex-1 text-sm truncate">{fileName}</span>
      {fileSize && (
        <span className="text-xs text-muted-foreground shrink-0">
          {fileSize > 1024 * 1024
            ? `${(fileSize / (1024 * 1024)).toFixed(1)} MB`
            : `${Math.round(fileSize / 1024)} KB`}
        </span>
      )}
      <Badge variant="outline" className="text-xs shrink-0">
        {fileType === 'file' ? (mimeType?.split('/')[1] ?? 'file') : 'link'}
      </Badge>
      <Button
        variant="ghost"
        size="icon"
        onClick={handleDelete}
        disabled={isPending}
        aria-label={`Remove ${fileName} from notebook`}
        className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
      >
        <Trash2 className="size-3.5" />
      </Button>
    </a>
  );
}
