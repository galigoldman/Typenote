'use client';

import { useRef, useCallback, useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { cn } from '@/lib/utils';
import type {
  Stroke,
  Point,
  ToolSettings,
  DrawingBlockAttrs,
} from '@/lib/drawing/types';
import { renderAllStrokes, renderStroke } from '@/lib/drawing/stroke-renderer';
import { DrawingToolbar } from './drawing-toolbar';

interface DrawingCanvasProps {
  strokes: Stroke[];
  width: number;
  height: number;
  background: DrawingBlockAttrs['background'];
  editable: boolean;
  onStrokesChange: (strokes: Stroke[]) => void;
}

/**
 * Maps the `background` prop to a Tailwind CSS class that renders a visual
 * background pattern directly on the canvas wrapper.  The actual `<canvas>`
 * element sits on top with a transparent background so strokes are drawn above
 * the pattern.
 */
function getBackgroundClass(
  background: DrawingBlockAttrs['background'],
): string {
  switch (background) {
    case 'lined':
      return 'bg-[linear-gradient(transparent_31px,_#e5e7eb_31px)] bg-[size:100%_32px]';
    case 'grid':
      return 'bg-[linear-gradient(#e5e7eb_1px,_transparent_1px),_linear-gradient(90deg,_#e5e7eb_1px,_transparent_1px)] bg-[size:32px_32px]';
    case 'transparent':
    default:
      return '';
  }
}

export function DrawingCanvas({
  strokes,
  width,
  height,
  background,
  editable,
  onStrokesChange,
}: DrawingCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [toolSettings, setToolSettings] = useState<ToolSettings>({
    tool: 'pen',
    color: '#000000',
    width: 2,
  });

  const [currentStroke, setCurrentStroke] = useState<Point[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);

  // ---------------------------------------------------------------------------
  // Canvas rendering
  // ---------------------------------------------------------------------------
  // Re-render every time the committed strokes, canvas dimensions, or the
  // in-progress stroke change.  This is a "full redraw" approach: cheap enough
  // for typical hand-drawn note blocks and avoids the complexity of incremental
  // rendering with eraser compositing.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Draw all committed strokes (this also clears the canvas first).
    renderAllStrokes(ctx, strokes, width, height);

    // If the user is currently drawing, render the in-progress stroke as a
    // temporary overlay so they get immediate visual feedback.
    if (currentStroke.length > 0) {
      const tempStroke: Stroke = {
        id: 'current',
        points: currentStroke,
        color: toolSettings.color,
        width: toolSettings.width,
        tool: toolSettings.tool,
      };
      renderStroke(ctx, tempStroke);
    }
  }, [strokes, width, height, currentStroke, toolSettings]);

  // ---------------------------------------------------------------------------
  // Pointer event handlers
  // ---------------------------------------------------------------------------
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);

    setIsDrawing(true);
    setCurrentStroke([
      [e.nativeEvent.offsetX, e.nativeEvent.offsetY, e.pressure],
    ]);
  }, []);

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDrawing) return;

      setCurrentStroke((prev) => [
        ...prev,
        [e.nativeEvent.offsetX, e.nativeEvent.offsetY, e.pressure],
      ]);
    },
    [isDrawing],
  );

  const handlePointerUp = useCallback(() => {
    if (!isDrawing) return;

    setIsDrawing(false);

    if (currentStroke.length >= 2) {
      const newStroke: Stroke = {
        id: uuidv4(),
        points: currentStroke,
        color: toolSettings.color,
        width: toolSettings.width,
        tool: toolSettings.tool,
      };
      onStrokesChange([...strokes, newStroke]);
    }

    setCurrentStroke([]);
  }, [isDrawing, currentStroke, toolSettings, strokes, onStrokesChange]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  const backgroundClass = getBackgroundClass(background);

  return (
    <div className="flex flex-col border rounded-md overflow-hidden">
      {editable && (
        <DrawingToolbar
          settings={toolSettings}
          onSettingsChange={setToolSettings}
          onClear={() => onStrokesChange([])}
        />
      )}
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className={cn('cursor-crosshair', backgroundClass)}
        style={{
          touchAction: 'none',
          width: '100%',
          height: 'auto',
          aspectRatio: `${width}/${height}`,
        }}
        onPointerDown={editable ? handlePointerDown : undefined}
        onPointerMove={editable ? handlePointerMove : undefined}
        onPointerUp={editable ? handlePointerUp : undefined}
        onPointerLeave={editable ? handlePointerUp : undefined}
      />
    </div>
  );
}
