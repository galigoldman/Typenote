'use client';

import { useRef } from 'react';
import { Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useFileUpload } from '@/hooks/use-file-upload';
import { createPersonalFile } from '@/lib/actions/personal-files';
import { toast } from 'sonner';
import { trackEvent } from '@/lib/analytics/events';

interface PersonalFileUploadProps {
  courseId: string;
  weekId?: string;
  userId: string;
  category: 'material' | 'homework';
  label?: string;
}

export function PersonalFileUpload({
  courseId,
  weekId,
  userId,
  category,
  label,
}: PersonalFileUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { uploading, progress, error, upload, reset } = useFileUpload(
    'personal-files',
    [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ],
  );

  async function handleFile(file: File) {
    const path = weekId
      ? `${userId}/${courseId}/${weekId}/${file.name}`
      : `${userId}/${courseId}/${file.name}`;

    try {
      await upload(file, path);
      await createPersonalFile({
        courseId,
        weekId,
        category,
        fileName: file.name,
        mimeType: file.type,
        fileSize: file.size,
        storagePath: path,
      });
      reset();
      trackEvent('personal_file_uploaded', {
        file_size: file.size,
        mime_type: file.type,
        course_id: courseId,
      });
      toast.success('File imported');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = '';
  }

  const buttonLabel =
    label ?? (category === 'homework' ? 'Import Homework' : 'Import File');

  return (
    <div>
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
          {buttonLabel}
        </Button>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="hidden"
        onChange={handleInputChange}
      />
      {error && <p className="mt-1 text-sm text-destructive">{error}</p>}
    </div>
  );
}
