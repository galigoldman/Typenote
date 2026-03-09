'use client';

import { useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useFileUpload } from '@/hooks/use-file-upload';
import { createCourseMaterial } from '@/lib/actions/course-materials';
import { toast } from 'sonner';

interface MaterialUploadProps {
  weekId: string;
  courseId: string;
  userId: string;
  category: 'material' | 'homework';
}

export function MaterialUpload({
  weekId,
  courseId,
  userId,
  category,
}: MaterialUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { uploading, progress, error, upload, reset } =
    useFileUpload('course-materials');
  const [dragOver, setDragOver] = useState(false);

  async function handleFile(file: File) {
    const path = `${userId}/${courseId}/${weekId}/${file.name}`;

    try {
      await upload(file, path);
      await createCourseMaterial({
        week_id: weekId,
        category,
        storage_path: path,
        file_name: file.name,
        file_size: file.size,
        mime_type: file.type,
      });
      reset();
      toast.success(
        `${category === 'homework' ? 'Homework' : 'Material'} uploaded`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    // Reset input so same file can be selected again
    e.target.value = '';
  }

  return (
    <div>
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`flex items-center justify-center rounded-md border border-dashed p-3 transition-colors ${
          dragOver
            ? 'border-primary bg-primary/5'
            : 'border-muted-foreground/25'
        }`}
      >
        {uploading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            Uploading...
          </div>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="size-4" />
            {category === 'homework' ? 'Add Homework' : 'Add Material'}
          </Button>
        )}
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,application/pdf"
        className="hidden"
        onChange={handleInputChange}
      />
      {error && <p className="mt-1 text-sm text-destructive">{error}</p>}
    </div>
  );
}
