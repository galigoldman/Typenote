'use client';

import { useState, useCallback } from 'react';
import {
  exportDocumentAsPdf,
  type ExportableDocument,
} from '@/lib/pdf/export-pdf';
import { toast } from 'sonner';
import { trackEvent } from '@/lib/analytics/events';

export function useExportPdf() {
  const [isExporting, setIsExporting] = useState(false);

  const exportPdf = useCallback(
    async (document: ExportableDocument) => {
      if (isExporting) return;

      setIsExporting(true);
      try {
        await exportDocumentAsPdf(document);
        const pages = document.pages as Record<string, unknown> | null;
        const pageArray = pages?.pages as unknown[] | undefined;
        trackEvent('pdf_exported', {
          page_count: pageArray?.length ?? 1,
        });
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
