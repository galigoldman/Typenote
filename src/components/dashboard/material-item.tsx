'use client';

import { useState } from 'react';
import { FileText, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';
import { deleteCourseMaterial } from '@/lib/actions/course-materials';
import { toast } from 'sonner';
import type { CourseMaterial } from '@/types/database';

interface MaterialItemProps {
  material: CourseMaterial;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function MaterialItem({ material }: MaterialItemProps) {
  const [deleting, setDeleting] = useState(false);

  async function handleView() {
    const supabase = createClient();
    const { data } = await supabase.storage
      .from('course-materials')
      .createSignedUrl(material.storage_path, 3600);

    if (data?.signedUrl) {
      window.open(data.signedUrl, '_blank');
    } else {
      toast.error('Failed to open file');
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
        className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm"
      >
        <FileText className="size-4 shrink-0 text-muted-foreground" />
        <span className="truncate">
          {material.label || material.file_name}
        </span>
        <span className="shrink-0 text-xs text-muted-foreground">
          {formatFileSize(material.file_size)}
        </span>
      </button>
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={handleDelete}
        disabled={deleting}
        className="shrink-0 opacity-0 group-hover:opacity-100 hover:opacity-100"
      >
        <Trash2 className="size-3.5 text-muted-foreground" />
      </Button>
    </div>
  );
}
