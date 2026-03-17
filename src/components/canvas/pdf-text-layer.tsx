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

        const tx = item.transform;
        const fontSize = Math.sqrt(tx[2] * tx[2] + tx[3] * tx[3]);
        const scaledFontSize = fontSize * scale;
        const left = tx[4] * scale + offsetX;
        const top =
          offsetY + scaledContentHeight - tx[5] * scale - scaledFontSize;

        // Check if next item is on the same line — if so, add a trailing space
        // so browser selection includes spaces between words
        let trailingSpace = false;
        const next = items[i + 1] as PdfTextItem | undefined;
        if (next?.str && next.transform) {
          const sameLine = Math.abs(next.transform[5] - tx[5]) < fontSize * 0.5;
          if (sameLine) trailingSpace = true;
        }

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
            {trailingSpace ? ' ' : ''}
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
