'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, FileType2, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';
import {
  openPersonalFileAsDocument,
  deletePersonalFile,
} from '@/lib/actions/personal-files';
import { toast } from 'sonner';
import type { PersonalFile } from '@/types/database';

interface PersonalFileItemProps {
  file: PersonalFile;
  currentUserId?: string;
  isOwner?: boolean;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function getPdfPageCount(signedUrl: string): Promise<number> {
  const { pdfjsLib } = await import('@/lib/pdf/pdfjs-setup');
  const doc = await pdfjsLib.getDocument(signedUrl).promise;
  const count = doc.numPages;
  doc.destroy();
  return count;
}

export function PersonalFileItem({
  file,
  currentUserId,
  isOwner = false,
}: PersonalFileItemProps) {
  const router = useRouter();
  const [opening, setOpening] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const canDelete =
    isOwner || currentUserId === undefined || file.user_id === currentUserId;

  const isPdf = file.mime_type === 'application/pdf';
  const isDocx = file.mime_type.includes('wordprocessingml');

  async function handleAction() {
    if (opening) return;

    if (isPdf) {
      setOpening(true);
      try {
        const supabase = createClient();
        const { data } = await supabase.storage
          .from('personal-files')
          .createSignedUrl(file.storage_path, 3600);

        if (!data?.signedUrl) {
          toast.error('Failed to open file');
          setOpening(false);
          return;
        }

        const pageCount = await getPdfPageCount(data.signedUrl);
        const result = await openPersonalFileAsDocument({
          fileId: file.id,
          pageCount,
        });

        router.push(`/dashboard/documents/${result.documentId}`);
      } catch {
        toast.error('Failed to open file');
        setOpening(false);
      }
    } else if (isDocx) {
      setOpening(true);
      try {
        const result = await openPersonalFileAsDocument({
          fileId: file.id,
        });

        router.push(`/dashboard/documents/${result.documentId}`);
      } catch {
        toast.error('Failed to open file');
        setOpening(false);
      }
    }
  }

  async function handleDelete() {
    if (
      !window.confirm(
        'Delete this file? Documents created from it will not be affected.',
      )
    )
      return;
    setDeleting(true);
    try {
      await deletePersonalFile(file.id);
      toast.success('File deleted');
    } catch {
      setDeleting(false);
      toast.error('Failed to delete file');
    }
  }

  const FileIcon = isDocx ? FileType2 : FileText;

  return (
    <div className="group flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-muted/50">
      <button
        onClick={handleAction}
        disabled={opening}
        className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm"
      >
        {opening ? (
          <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
        ) : (
          <FileIcon className="size-4 shrink-0 text-muted-foreground" />
        )}
        <span className="truncate">{file.display_name}</span>
        <span className="shrink-0 text-xs text-muted-foreground">
          {formatFileSize(file.file_size)}
        </span>
      </button>
      {canDelete && (
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={handleDelete}
          disabled={deleting}
          aria-label="Delete file"
          className="shrink-0 opacity-0 group-hover:opacity-100 hover:opacity-100"
        >
          <Trash2 className="size-3.5 text-muted-foreground" />
        </Button>
      )}
    </div>
  );
}
