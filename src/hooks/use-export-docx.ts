'use client';

import { useState, useCallback } from 'react';
import { type DocxExportableDocument } from '@/lib/docx/export-docx';
import { toast } from 'sonner';
import { trackEvent } from '@/lib/analytics/events';

export function useExportDocx() {
  const [isExporting, setIsExporting] = useState(false);

  const exportDocx = useCallback(
    async (document: DocxExportableDocument) => {
      if (isExporting) return;

      setIsExporting(true);
      try {
        // Dynamic import to avoid loading docx library until needed
        const { exportDocumentAsDocx } = await import('@/lib/docx/export-docx');
        await exportDocumentAsDocx(document);
        trackEvent('docx_exported', {});
        toast.success('DOCX exported successfully');
      } catch (error) {
        console.error('DOCX export failed:', error);
        toast.error('Failed to export DOCX', {
          action: {
            label: 'Retry',
            onClick: () => exportDocx(document),
          },
        });
      } finally {
        setIsExporting(false);
      }
    },
    [isExporting],
  );

  return { exportDocx, isExporting };
}
