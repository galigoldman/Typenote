'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { PAGE_WIDTH, PAGE_HEIGHT } from '@/types/canvas';

import type { PDFDocumentProxy } from 'pdfjs-dist';

/** Minimal TextContent shape from pdf.js */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TextContent = { items: any[]; styles: Record<string, any> };

export interface PdfTextLayerInfo {
  textContent: TextContent | null;
  /** Viewport scale used to render the PDF page (for text positioning) */
  scale: number;
  /** Horizontal offset to center the PDF on the page */
  offsetX: number;
  /** Vertical offset to center the PDF on the page */
  offsetY: number;
  loading: boolean;
}

/**
 * Extracts text content and positioning data from a PDF page.
 * Uses the same scaling/centering logic as usePdfBackground so the
 * text layer aligns perfectly with the rendered PDF canvas.
 */
export function usePdfTextLayer(
  materialId: string | null,
  pageNum: number,
  personalFileId?: string | null,
): PdfTextLayerInfo {
  const [textContent, setTextContent] = useState<TextContent | null>(null);
  const [scale, setScale] = useState(1);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [loading, setLoading] = useState(!!materialId);

  const pdfDocRef = useRef<PDFDocumentProxy | null>(null);

  useEffect(() => {
    if (!materialId && !personalFileId) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function loadTextContent() {
      try {
        setLoading(true);

        const supabase = createClient();
        let bucket: string;
        let storagePath: string;

        if (materialId) {
          // Fetch course material storage details
          const { data: material, error: matError } = await supabase
            .from('course_materials')
            .select('storage_path')
            .eq('id', materialId)
            .single();

          if (matError || !material) {
            throw new Error('Material not found');
          }

          const isMoodle = material.storage_path.startsWith('moodle:');
          bucket = isMoodle ? 'moodle-materials' : 'course-materials';
          storagePath = isMoodle
            ? material.storage_path.slice('moodle:'.length)
            : material.storage_path;
        } else {
          // Fetch personal file storage details
          const { data: file, error: fileError } = await supabase
            .from('personal_files')
            .select('storage_path')
            .eq('id', personalFileId!)
            .single();

          if (fileError || !file) {
            throw new Error('Personal file not found');
          }

          bucket = 'personal-files';
          storagePath = file.storage_path;
        }

        // Generate signed URL
        const { data: urlData } = await supabase.storage
          .from(bucket)
          .createSignedUrl(storagePath, 3600);

        if (!urlData?.signedUrl) {
          throw new Error('Failed to generate file URL');
        }

        // Dynamically import pdfjs-dist to avoid SSR issues
        const { pdfjsLib } = await import('@/lib/pdf/pdfjs-setup');

        if (cancelled) return;

        // Load PDF document
        const loadingTask = pdfjsLib.getDocument(urlData.signedUrl);
        const pdfDoc = await loadingTask.promise;

        if (cancelled) {
          pdfDoc.destroy();
          return;
        }

        pdfDocRef.current = pdfDoc;

        // Get page (pdfjs is 1-indexed)
        const page = await pdfDoc.getPage(pageNum + 1);
        const viewport = page.getViewport({ scale: 1 });

        // Same scaling logic as use-pdf-background.ts
        const scaleX = PAGE_WIDTH / viewport.width;
        const scaleY = PAGE_HEIGHT / viewport.height;
        const computedScale = Math.min(scaleX, scaleY);

        const scaledViewport = page.getViewport({ scale: computedScale });
        const ox = (PAGE_WIDTH - scaledViewport.width) / 2;
        const oy = (PAGE_HEIGHT - scaledViewport.height) / 2;

        if (cancelled) return;

        // Extract text content
        const content = await page.getTextContent();

        if (cancelled) return;

        setScale(computedScale);
        setOffsetX(ox);
        setOffsetY(oy);
        setTextContent(content);
        setLoading(false);
      } catch {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadTextContent();

    return () => {
      cancelled = true;
      pdfDocRef.current?.destroy();
      pdfDocRef.current = null;
    };
  }, [materialId, personalFileId, pageNum]);

  return { textContent, scale, offsetX, offsetY, loading };
}
