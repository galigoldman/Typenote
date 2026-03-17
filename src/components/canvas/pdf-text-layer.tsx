'use client';

import { useCallback, useEffect, useRef } from 'react';
import { usePdfTextLayer } from '@/hooks/use-pdf-text-layer';
import { PAGE_HEIGHT } from '@/types/canvas';

/** Subset of pdf.js TextItem — we only use the fields needed for positioning */
interface PdfTextItem {
  str: string;
  dir: 'ltr' | 'rtl' | 'ttb';
  transform: number[];
  width?: number;
  height?: number;
}

interface PdfTextLayerProps {
  pdfPage: number;
  materialId: string;
  isActive: boolean;
  onTextSelected?: (text: string, rect: DOMRect | null) => void;
}

export function PdfTextLayer({
  pdfPage,
  materialId,
  isActive,
  onTextSelected,
}: PdfTextLayerProps) {
  const { textContent, scale, offsetX, offsetY, loading } = usePdfTextLayer(
    materialId,
    pdfPage,
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const onTextSelectedRef = useRef(onTextSelected);
  useEffect(() => {
    onTextSelectedRef.current = onTextSelected;
  });

  // Listen for selection changes
  const handleSelectionChange = useCallback(() => {
    if (!isActive) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) {
      onTextSelectedRef.current?.('', null);
      return;
    }

    // Check if selection is within our container
    const range = sel.getRangeAt(0);
    const container = containerRef.current;
    if (!container || !container.contains(range.commonAncestorContainer)) {
      return;
    }

    const text = sel.toString().trim();
    if (text) {
      const rect = range.getBoundingClientRect();
      onTextSelectedRef.current?.(text, rect);
    } else {
      onTextSelectedRef.current?.('', null);
    }
  }, [isActive]);

  useEffect(() => {
    document.addEventListener('selectionchange', handleSelectionChange);
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
    };
  }, [handleSelectionChange]);

  if (loading || !textContent) return null;

  const items = textContent.items as PdfTextItem[];
  if (!items || items.length === 0) return null;

  // The scaled PDF content height — used for Y-axis coordinate conversion.
  // PDF coordinates: Y goes UP from bottom-left.
  // HTML coordinates: Y goes DOWN from top-left.
  // scaledContentHeight = viewport.height * scale = PAGE_HEIGHT - 2 * offsetY
  const scaledContentHeight = PAGE_HEIGHT - 2 * offsetY;

  return (
    <div
      ref={containerRef}
      className="absolute inset-0"
      style={{
        pointerEvents: isActive ? 'auto' : 'none',
        userSelect: isActive ? 'text' : 'none',
        WebkitUserSelect: isActive ? 'text' : 'none',
        cursor: isActive ? 'text' : 'default',
      }}
    >
      {items.map((item, i) => {
        if (!item.str || item.str.trim() === '') return null;

        // transform = [a, b, c, d, e, f]  (standard 2D matrix)
        // a = horizontal scale (≈ fontSize), d = vertical scale (≈ fontSize)
        // e = x position, f = y position (baseline, from bottom of page)
        const tx = item.transform;

        // Font size from the vertical component of the matrix
        const fontSize = Math.sqrt(tx[2] * tx[2] + tx[3] * tx[3]);
        const scaledFontSize = fontSize * scale;

        // X position: scale and offset to match PDF canvas centering
        const left = tx[4] * scale + offsetX;

        // Y position: convert PDF bottom-up to CSS top-down
        // tx[5] is baseline Y from page bottom in PDF units
        // After scaling: scaledY = tx[5] * scale (from bottom of content area)
        // CSS top = offsetY + (scaledContentHeight - scaledY)
        // We don't subtract fontSize here because tx[5] is the baseline,
        // and we want the span positioned at the baseline
        const top =
          offsetY + scaledContentHeight - tx[5] * scale - scaledFontSize;

        const isRtl = item.dir === 'rtl';

        return (
          <span
            key={i}
            dir={isRtl ? 'rtl' : 'ltr'}
            style={{
              position: 'absolute',
              left,
              top,
              fontSize: `${scaledFontSize}px`,
              fontFamily: 'sans-serif',
              color: 'transparent',
              whiteSpace: 'pre',
              lineHeight: 1,
              transformOrigin: 'left top',
              width: item.width ? item.width * scale : undefined,
              direction: isRtl ? 'rtl' : 'ltr',
              unicodeBidi: 'bidi-override',
            }}
          >
            {item.str}
          </span>
        );
      })}

      {/* Selection highlight styling */}
      <style>{`
        [data-pdf-text-layer] ::selection {
          background: rgba(59, 130, 246, 0.3);
        }
      `}</style>
    </div>
  );
}
