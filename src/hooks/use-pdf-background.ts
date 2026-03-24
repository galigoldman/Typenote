'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { PAGE_WIDTH, PAGE_HEIGHT } from '@/types/canvas';

import type { PDFDocumentProxy } from 'pdfjs-dist';

interface MaterialInfo {
  storagePath: string;
  bucket: string;
}

export interface PdfBackground {
  renderPage: (pageNum: number, canvas: HTMLCanvasElement) => Promise<void>;
  isLoading: boolean;
  error: string | null;
  pageCount: number;
}

interface UsePdfBackgroundOptions {
  onPageCountReady?: (count: number) => void;
}

/**
 * Loads a PDF from Supabase Storage and provides a function to render
 * individual pages onto canvas elements. Used by the canvas editor to
 * display PDF content as page backgrounds for material-backed documents
 * or personal-file-backed documents.
 */
export function usePdfBackground(
  materialId: string | null,
  options?: UsePdfBackgroundOptions,
  personalFileId?: string | null,
): PdfBackground {
  const sourceId = materialId || personalFileId || null;
  const [isLoading, setIsLoading] = useState(!!sourceId);
  const [error, setError] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState(0);

  const pdfDocRef = useRef<PDFDocumentProxy | null>(null);
  const materialInfoRef = useRef<MaterialInfo | null>(null);
  // Track in-progress renders per canvas to prevent concurrent render() calls
  const renderingRef = useRef<Set<HTMLCanvasElement>>(new Set());

  // Fetch material/personal-file info and load PDF
  useEffect(() => {
    if (!materialId && !personalFileId) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    async function loadPdf() {
      try {
        setIsLoading(true);
        setError(null);

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

        materialInfoRef.current = { storagePath, bucket };

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
        setPageCount(pdfDoc.numPages);
        options?.onPageCountReady?.(pdfDoc.numPages);
        setIsLoading(false);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load PDF');
          setIsLoading(false);
        }
      }
    }

    loadPdf();

    return () => {
      cancelled = true;
      pdfDocRef.current?.destroy();
      pdfDocRef.current = null;
    };
  }, [materialId, personalFileId]);

  // pageCount in deps so renderPage gets a new identity when PDF loads,
  // triggering re-render in CanvasPage's useEffect
  const renderPage = useCallback(
    async (pageNum: number, canvas: HTMLCanvasElement) => {
      const pdfDoc = pdfDocRef.current;
      if (!pdfDoc) return;

      // Skip if this canvas is already rendering (React strict mode double-fires)
      if (renderingRef.current.has(canvas)) return;
      renderingRef.current.add(canvas);

      // pdfjs uses 1-indexed pages, our pdfPage field is 0-indexed
      const page = await pdfDoc.getPage(pageNum + 1);
      const viewport = page.getViewport({ scale: 1 });

      // Scale to fit the canvas page dimensions while preserving aspect ratio
      const scaleX = PAGE_WIDTH / viewport.width;
      const scaleY = PAGE_HEIGHT / viewport.height;
      const scale = Math.min(scaleX, scaleY);

      const scaledViewport = page.getViewport({ scale });

      // Set canvas backing size for sharp rendering
      const dpr = window.devicePixelRatio || 1;
      canvas.width = PAGE_WIDTH * dpr;
      canvas.height = PAGE_HEIGHT * dpr;
      canvas.style.width = `${PAGE_WIDTH}px`;
      canvas.style.height = `${PAGE_HEIGHT}px`;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.scale(dpr, dpr);

      // Center the rendered page on the canvas
      const offsetX = (PAGE_WIDTH - scaledViewport.width) / 2;
      const offsetY = (PAGE_HEIGHT - scaledViewport.height) / 2;
      ctx.translate(offsetX, offsetY);

      try {
        await page.render({
          canvasContext: ctx,
          viewport: scaledViewport,
          canvas,
        }).promise;
      } finally {
        renderingRef.current.delete(canvas);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pageCount],
  );

  return { renderPage, isLoading, error, pageCount };
}
