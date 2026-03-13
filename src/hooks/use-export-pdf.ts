'use client';

import { useState, useCallback } from 'react';
import {
  exportDocumentAsPdf,
  type ExportableDocument,
} from '@/lib/pdf/export-pdf';
import { toast } from 'sonner';

export function useExportPdf() {
  const [isExporting, setIsExporting] = useState(false);

  const exportPdf = useCallback(
    async (document: ExportableDocument) => {
      if (isExporting) return;

      setIsExporting(true);
      try {
        await exportDocumentAsPdf(document);
        toast.success('PDF exported successfully');
      } catch (error) {
        console.error('PDF export failed:', error);
        toast.error('Failed to export PDF', {
          action: {
            label: 'Retry',
            onClick: () => exportPdf(document),
          },
        });
      } finally {
        setIsExporting(false);
      }
    },
    [isExporting],
  );

  return { exportPdf, isExporting };
}
