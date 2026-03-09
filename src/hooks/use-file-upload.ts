'use client';

import { useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const ALLOWED_MIME_TYPES = ['application/pdf'];

interface UploadState {
  uploading: boolean;
  progress: number;
  error: string | null;
}

export function useFileUpload(bucketName: string) {
  const [state, setState] = useState<UploadState>({
    uploading: false,
    progress: 0,
    error: null,
  });

  const validateFile = useCallback((file: File): string | null => {
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return 'Only PDF files are accepted';
    }
    if (file.size > MAX_FILE_SIZE) {
      return 'File size must be under 50MB';
    }
    return null;
  }, []);

  const upload = useCallback(
    async (file: File, path: string): Promise<string> => {
      const validationError = validateFile(file);
      if (validationError) {
        setState({ uploading: false, progress: 0, error: validationError });
        throw new Error(validationError);
      }

      setState({ uploading: true, progress: 0, error: null });

      try {
        const supabase = createClient();
        const { error } = await supabase.storage
          .from(bucketName)
          .upload(path, file, {
            cacheControl: '3600',
            upsert: false,
          });

        if (error) throw error;

        setState({ uploading: false, progress: 100, error: null });
        return path;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Upload failed';
        setState({ uploading: false, progress: 0, error: message });
        throw new Error(message);
      }
    },
    [bucketName, validateFile],
  );

  const reset = useCallback(() => {
    setState({ uploading: false, progress: 0, error: null });
  }, []);

  return {
    ...state,
    upload,
    reset,
    validateFile,
  };
}
