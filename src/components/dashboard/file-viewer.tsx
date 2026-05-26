'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, Minus, Plus, X } from 'lucide-react';
import { getContextFileUrl } from '@/lib/actions/context-files';
import type { ContextFileType } from '@/types/database';
import type { PDFDocumentProxy } from 'pdfjs-dist';

interface FileViewerProps {
  fileType: ContextFileType;
  fileId: string;
  initialPage?: number; // 0-indexed
  onClose: () => void;
}

export function FileViewer({ fileType, fileId, initialPage, onClose }: FileViewerProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scale, setScale] = useState(1.2);
  const containerRef = useRef<HTMLDivElement>(null);
  const pdfRef = useRef<PDFDocumentProxy | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await getContextFileUrl({ fileType, fileId });
        if (!res) throw new Error('File unavailable');
        if (res.mimeType !== 'application/pdf') {
          // Non-PDF: open in a new tab and close the overlay.
          window.open(res.url, '_blank', 'noopener,noreferrer');
          onClose();
          return;
        }
        const { pdfjsLib } = await import('@/lib/pdf/pdfjs-setup');
        const pdf = await pdfjsLib.getDocument(res.url).promise;
        if (cancelled) { pdf.destroy(); return; }
        pdfRef.current = pdf;
        await renderAll(pdf, scale);
        if (initialPage != null) {
          document.getElementById(`ctx-pdf-page-${initialPage}`)?.scrollIntoView();
        }
        setLoading(false);
      } catch (e) {
        if (!cancelled) { setError(e instanceof Error ? e.message : 'Failed to load'); setLoading(false); }
      }
    }
    load();
    return () => { cancelled = true; pdfRef.current?.destroy(); pdfRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileType, fileId]);

  // Re-render on zoom.
  useEffect(() => {
    if (pdfRef.current && !loading) renderAll(pdfRef.current, scale);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scale]);

  async function renderAll(pdf: PDFDocumentProxy, s: number) {
    const container = containerRef.current;
    if (!container) return;
    container.innerHTML = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: s });
      const canvas = document.createElement('canvas');
      canvas.id = `ctx-pdf-page-${i - 1}`;
      canvas.className = 'mx-auto mb-3 shadow';
      const dpr = window.devicePixelRatio || 1;
      canvas.width = viewport.width * dpr;
      canvas.height = viewport.height * dpr;
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      const ctx = canvas.getContext('2d')!;
      ctx.scale(dpr, dpr);
      container.appendChild(canvas);
      await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    }
  }

  return (
    <div
      data-testid="file-viewer"
      className="fixed inset-0 z-[60] flex flex-col bg-black/70 backdrop-blur-sm"
    >
      <div className="flex items-center justify-between border-b border-white/10 bg-background px-4 py-2">
        <span className="text-sm font-medium">Source viewer</span>
        <div className="flex items-center gap-2">
          <button aria-label="Zoom out" onClick={() => setScale((s) => Math.max(0.5, s - 0.2))} className="rounded p-1 hover:bg-accent"><Minus className="h-4 w-4" /></button>
          <button aria-label="Zoom in" onClick={() => setScale((s) => Math.min(3, s + 0.2))} className="rounded p-1 hover:bg-accent"><Plus className="h-4 w-4" /></button>
          <button aria-label="Close viewer" onClick={onClose} className="rounded p-1 hover:bg-accent"><X className="h-5 w-5" /></button>
        </div>
      </div>
      <div ref={containerRef} className="flex-1 overflow-auto bg-neutral-800 p-4">
        {loading && (
          <div className="flex h-full items-center justify-center text-white"><Loader2 className="h-6 w-6 animate-spin" /></div>
        )}
        {error && <p className="text-center text-sm text-red-300">{error}</p>}
      </div>
    </div>
  );
}
