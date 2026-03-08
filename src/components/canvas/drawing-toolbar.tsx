'use client';

import { Pen, Eraser } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const COLORS = [
  { value: '#000000', label: 'Black' },
  { value: '#3B82F6', label: 'Blue' },
  { value: '#EF4444', label: 'Red' },
  { value: '#22C55E', label: 'Green' },
  { value: '#8B5CF6', label: 'Purple' },
] as const;

const STROKE_WIDTHS = [1, 2, 4, 8] as const;

interface DrawingToolbarProps {
  color: string;
  strokeWidth: number;
  tool: 'pen' | 'eraser';
  onColorChange: (color: string) => void;
  onStrokeWidthChange: (width: number) => void;
  onToolChange: (tool: 'pen' | 'eraser') => void;
}

export function DrawingToolbar({
  color,
  strokeWidth,
  tool,
  onColorChange,
  onStrokeWidthChange,
  onToolChange,
}: DrawingToolbarProps) {
  return (
    <div className="absolute bottom-4 left-4 z-50 flex items-center gap-2 rounded-lg border bg-background/90 p-2 shadow-sm backdrop-blur-sm">
      {/* Color palette */}
      <div className="flex items-center gap-1">
        {COLORS.map(({ value, label }) => (
          <button
            key={value}
            className={cn(
              'h-6 w-6 rounded-full transition-all',
              color === value
                ? 'border-2 border-foreground scale-110'
                : 'border border-border hover:scale-105',
            )}
            style={{ backgroundColor: value }}
            onClick={() => onColorChange(value)}
            aria-label={`Color: ${label}`}
            aria-pressed={color === value}
            type="button"
          />
        ))}
      </div>

      <div className="mx-0.5 h-6 w-px bg-border" />

      {/* Stroke width options */}
      <div className="flex items-center gap-1">
        {STROKE_WIDTHS.map((width) => (
          <button
            key={width}
            className={cn(
              'flex h-6 w-6 items-center justify-center rounded-full transition-all',
              strokeWidth === width
                ? 'bg-accent border border-foreground'
                : 'border border-border hover:bg-accent/50',
            )}
            onClick={() => onStrokeWidthChange(width)}
            aria-label={`Stroke width: ${width}px`}
            aria-pressed={strokeWidth === width}
            type="button"
          >
            <span
              className="rounded-full bg-foreground"
              style={{
                width: `${Math.max(width, 2)}px`,
                height: `${Math.max(width, 2)}px`,
              }}
            />
          </button>
        ))}
      </div>

      <div className="mx-0.5 h-6 w-px bg-border" />

      {/* Tool toggle: Pen / Eraser */}
      <div className="flex items-center gap-1">
        <Button
          variant={tool === 'pen' ? 'secondary' : 'ghost'}
          size="icon-sm"
          onClick={() => onToolChange('pen')}
          aria-label="Pen tool"
          aria-pressed={tool === 'pen'}
        >
          <Pen className="size-4" />
        </Button>
        <Button
          variant={tool === 'eraser' ? 'secondary' : 'ghost'}
          size="icon-sm"
          onClick={() => onToolChange('eraser')}
          aria-label="Eraser tool"
          aria-pressed={tool === 'eraser'}
        >
          <Eraser className="size-4" />
        </Button>
      </div>
    </div>
  );
}
