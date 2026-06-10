'use client';

import { useRef, useState } from 'react';
import { Loader2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useFileUpload } from '@/hooks/use-file-upload';
import { createPersonalFile } from '@/lib/actions/personal-files';
import { toast } from 'sonner';
import { trackEvent } from '@/lib/analytics/events';

interface PersonalFileUploadProps {
  courseId: string;
  userId: string;
  category: 'material' | 'homework';
  label?: string;
}

/**
 * The import flow has two long-running steps the user must see:
 * storage upload, then server-side processing (text extraction + embedding,
 * which can take 10-30s for large PDFs). A single boolean hid the second
 * phase entirely — model the flow as explicit phases instead.
 */
type UploadPhase = 'idle' | 'uploading' | 'processing';

const PHASE_LABELS: Record<Exclude<UploadPhase, 'idle'>, string> = {
  uploading: 'Uploading...',
  processing: 'Processing file...',
};

export function PersonalFileUpload({
  courseId,
  userId,
  category,
  label,
}: PersonalFileUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<UploadPhase>('idle');
  const { error, upload } = useFileUpload('personal-files', [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ]);

  async function handleFile(file: File) {
    const path = `${userId}/${courseId}/${file.name}`;

    try {
      setPhase('uploading');
      await upload(file, path);

      setPhase('processing');
      await createPersonalFile({
        courseId,
        category,
        fileName: file.name,
        mimeType: file.type,
        fileSize: file.size,
        storagePath: path,
      });

      trackEvent('personal_file_uploaded', {
        file_size: file.size,
        mime_type: file.type,
        course_id: courseId,
      });
      toast.success('File imported');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setPhase('idle');
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
      {phase !== 'idle' ? (
        <div
          className="flex h-8 items-center gap-2 px-3 text-sm text-muted-foreground"
          aria-live="polite"
        >
          <Loader2 className="size-4 animate-spin" />
          {PHASE_LABELS[phase]}
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
