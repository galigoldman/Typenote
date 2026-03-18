'use client';

import { useState, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import type { QuestionBoundary } from '@/types/assignments';

export interface SplitEditorProps {
  descriptionHtml: string;
  initialBoundaries: QuestionBoundary[];
  onSave: (params: { boundaries: QuestionBoundary[]; isPersonal: boolean }) => void;
  onCancel: () => void;
}

/** Snap a raw character position to the nearest closing-tag boundary in html. */
function snapToElementBoundary(html: string, position: number): number {
  const validPositions = [0];
  const tagRegex = /<\/[a-z][a-z0-9]*>/gi;
  let match;
  while ((match = tagRegex.exec(html)) !== null) {
    validPositions.push(match.index + match[0].length);
  }
  validPositions.push(html.length);

  let closest = validPositions[0];
  for (const vp of validPositions) {
    if (Math.abs(vp - position) < Math.abs(closest - position)) closest = vp;
  }
  return closest;
}

/** Rebuild boundary positions so every question covers a contiguous range. */
function rebuildBoundaries(
  boundaries: QuestionBoundary[],
  totalLength: number,
): QuestionBoundary[] {
  return boundaries.map((b, i) => ({
    ...b,
    position: i,
    boundaryStart: b.boundaryStart,
    boundaryEnd: i < boundaries.length - 1 ? boundaries[i + 1].boundaryStart : totalLength,
  }));
}

export function SplitEditor({
  descriptionHtml,
  initialBoundaries,
  onSave,
  onCancel,
}: SplitEditorProps) {
  const [boundaries, setBoundaries] = useState<QuestionBoundary[]>(() =>
    initialBoundaries
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((b, i, arr) => ({
        ...b,
        position: i,
        boundaryEnd: i < arr.length - 1 ? arr[i + 1].boundaryStart : descriptionHtml.length,
      })),
  );

  const [editingLabelIdx, setEditingLabelIdx] = useState<number | null>(null);
  const [labelDraft, setLabelDraft] = useState('');

  // ---- Label editing -------------------------------------------------------

  const startEditLabel = useCallback((idx: number) => {
    setEditingLabelIdx(idx);
    setLabelDraft(boundaries[idx].label);
  }, [boundaries]);

  const commitLabel = useCallback(() => {
    if (editingLabelIdx === null) return;
    setBoundaries((prev) =>
      prev.map((b, i) => (i === editingLabelIdx ? { ...b, label: labelDraft.trim() || b.label } : b)),
    );
    setEditingLabelIdx(null);
  }, [editingLabelIdx, labelDraft]);

  // ---- Split ---------------------------------------------------------------

  const splitQuestion = useCallback(
    (idx: number) => {
      setBoundaries((prev) => {
        const target = prev[idx];
        const midRaw = Math.floor((target.boundaryStart + target.boundaryEnd) / 2);
        const mid = snapToElementBoundary(descriptionHtml, midRaw);

        // Don't create a zero-length split
        if (mid <= target.boundaryStart || mid >= target.boundaryEnd) return prev;

        const newBoundary: QuestionBoundary = {
          label: `${target.label}b`,
          position: idx + 1,
          boundaryStart: mid,
          boundaryEnd: target.boundaryEnd,
        };

        const updated = [
          ...prev.slice(0, idx),
          { ...target, boundaryEnd: mid },
          newBoundary,
          ...prev.slice(idx + 1),
        ];

        return rebuildBoundaries(updated, descriptionHtml.length);
      });
    },
    [descriptionHtml],
  );

  // ---- Merge ---------------------------------------------------------------

  const mergeQuestions = useCallback(
    (idx: number) => {
      // Merge question[idx] with question[idx+1]
      setBoundaries((prev) => {
        if (idx >= prev.length - 1) return prev;

        const a = prev[idx];
        const b = prev[idx + 1];
        const merged: QuestionBoundary = {
          ...a,
          boundaryEnd: b.boundaryEnd,
        };

        const updated = [...prev.slice(0, idx), merged, ...prev.slice(idx + 2)];
        return rebuildBoundaries(updated, descriptionHtml.length);
      });
    },
    [descriptionHtml.length],
  );

  // ---- Drag handle ---------------------------------------------------------

  const dragState = useRef<{ idx: number; startY: number; startPos: number } | null>(null);

  const handleDragStart = useCallback(
    (e: React.PointerEvent<HTMLDivElement>, idx: number) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      dragState.current = {
        idx,
        startY: e.clientY,
        startPos: boundaries[idx + 1]?.boundaryStart ?? descriptionHtml.length,
      };
    },
    [boundaries, descriptionHtml.length],
  );

  const handleDragMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragState.current) return;
      const { idx, startY, startPos } = dragState.current;

      // Treat 1 CSS pixel ≈ 1 HTML character — a rough heuristic for v1
      const delta = Math.round(e.clientY - startY);
      const rawPos = startPos + delta;
      const snapped = snapToElementBoundary(
        descriptionHtml,
        Math.max(0, Math.min(rawPos, descriptionHtml.length)),
      );

      setBoundaries((prev) => {
        const lower = prev[idx]?.boundaryStart ?? 0;
        const upper = prev[idx + 2]?.boundaryStart ?? descriptionHtml.length;

        // Keep within the two surrounding boundaries
        const clamped = Math.max(lower + 1, Math.min(snapped, upper - 1));
        if (clamped === prev[idx + 1]?.boundaryStart) return prev;

        const updated = prev.map((b, i) => {
          if (i === idx) return { ...b, boundaryEnd: clamped };
          if (i === idx + 1) return { ...b, boundaryStart: clamped };
          return b;
        });
        return rebuildBoundaries(updated, descriptionHtml.length);
      });
    },
    [descriptionHtml],
  );

  const handleDragEnd = useCallback(() => {
    dragState.current = null;
  }, []);

  // ---- Render --------------------------------------------------------------

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <span className="mr-auto text-sm font-semibold">Edit question splits</span>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onSave({ boundaries, isPersonal: true })}
        >
          Save as personal
        </Button>
        <Button
          size="sm"
          onClick={() => onSave({ boundaries, isPersonal: false })}
        >
          Save as shared
        </Button>
      </div>

      {/* Question blocks */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {boundaries.map((boundary, idx) => {
          const html = descriptionHtml.slice(boundary.boundaryStart, boundary.boundaryEnd);
          const isLastBlock = idx === boundaries.length - 1;

          return (
            <div key={idx}>
              {/* Question block */}
              <div className="rounded-lg border-l-4 border-l-blue-500 bg-card p-4 shadow-sm">
                {/* Block header */}
                <div className="mb-2 flex items-center gap-2">
                  {editingLabelIdx === idx ? (
                    <input
                      autoFocus
                      className="w-24 rounded border px-2 py-0.5 text-xs font-semibold"
                      value={labelDraft}
                      onChange={(e) => setLabelDraft(e.target.value)}
                      onBlur={commitLabel}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitLabel();
                        if (e.key === 'Escape') setEditingLabelIdx(null);
                      }}
                      aria-label="Edit label"
                    />
                  ) : (
                    <button
                      className="rounded px-1 text-xs font-semibold text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950"
                      onClick={() => startEditLabel(idx)}
                      title="Click to rename"
                    >
                      Question {boundary.label}
                    </button>
                  )}

                  <div className="ml-auto flex gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 px-2 text-xs"
                      onClick={() => splitQuestion(idx)}
                    >
                      Split
                    </Button>
                    {!isLastBlock && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        onClick={() => mergeQuestions(idx)}
                      >
                        Merge
                      </Button>
                    )}
                  </div>
                </div>

                {/* Content preview */}
                <div
                  className="prose prose-sm dark:prose-invert max-w-none text-sm"
                  dangerouslySetInnerHTML={{ __html: html }}
                />
              </div>

              {/* Drag handle between blocks */}
              {!isLastBlock && (
                <div
                  role="separator"
                  aria-label="Drag to adjust boundary"
                  className="group my-1 flex cursor-row-resize items-center justify-center py-1"
                  onPointerDown={(e) => handleDragStart(e, idx)}
                  onPointerMove={handleDragMove}
                  onPointerUp={handleDragEnd}
                  onPointerCancel={handleDragEnd}
                >
                  <div className="h-1 w-full rounded-full bg-muted transition-colors group-hover:bg-blue-300 dark:group-hover:bg-blue-700" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
