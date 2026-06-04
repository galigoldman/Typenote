'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';
import { openMaterialAsDocument } from '@/lib/actions/documents';
import { deleteCourseMaterial } from '@/lib/actions/course-materials';
import { toast } from 'sonner';
import type { CourseMaterial } from '@/types/database';

interface MaterialItemProps {
  material: CourseMaterial;
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

export function MaterialItem({
  material,
  currentUserId,
  isOwner = false,
}: MaterialItemProps) {
  const router = useRouter();
  const [opening, setOpening] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const canDelete =
    isOwner ||
    currentUserId === undefined ||
    material.user_id === currentUserId;

  async function handleView() {
    if (opening) return;
    setOpening(true);

    try {
      // Generate signed URL to count pages
      const supabase = createClient();
      const isMoodleRef = material.storage_path.startsWith('moodle:');
      const bucket = isMoodleRef ? 'moodle-materials' : 'course-materials';
      const path = isMoodleRef
        ? material.storage_path.slice(7)
        : material.storage_path;

      const { data } = await supabase.storage
        .from(bucket)
        .createSignedUrl(path, 3600);

      if (!data?.signedUrl) {
        toast.error('Failed to open file');
        setOpening(false);
        return;
      }

      // Get page count from PDF
      const pageCount = await getPdfPageCount(data.signedUrl);

      // Find or create document for this material
      const result = await openMaterialAsDocument(material.id, pageCount);

      // Navigate to the document
      router.push(`/dashboard/documents/${result.documentId}`);
    } catch {
      toast.error('Failed to open material');
      setOpening(false);
    }
  }

  async function handleDelete() {
    if (!confirm('Delete this file?')) return;
    setDeleting(true);
    try {
      await deleteCourseMaterial(material.id);
      toast.success('File deleted');
    } catch {
      setDeleting(false);
      toast.error('Failed to delete file');
    }
  }

  return (
    <div className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-muted/50">
      <button
        onClick={handleView}
        disabled={opening}
        className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm"
      >
        {opening ? (
          <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
        ) : (
          <FileText className="size-4 shrink-0 text-muted-foreground" />
        )}
        <span className="truncate">{material.label || material.file_name}</span>
        <span className="shrink-0 text-xs text-muted-foreground">
          {formatFileSize(material.file_size)}
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
