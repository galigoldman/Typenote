'use client';

import { Pen, Eraser, Minus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import type { ToolSettings, DrawingTool } from '@/lib/drawing/types';
import { DEFAULT_COLORS, DEFAULT_WIDTHS } from '@/lib/drawing/types';

interface DrawingToolbarProps {
  settings: ToolSettings;
  onSettingsChange: (settings: ToolSettings) => void;
  onClear: () => void;
}

const TOOL_ICONS: Record<DrawingTool, React.ReactNode> = {
  pen: <Pen />,
  eraser: <Eraser />,
};

const WIDTH_ICON_SIZES: Record<number, string> = {
  [DEFAULT_WIDTHS[0]]: 'size-2.5',
  [DEFAULT_WIDTHS[1]]: 'size-3',
  [DEFAULT_WIDTHS[2]]: 'size-4',
};

function VerticalSeparator() {
  return <Separator orientation="vertical" className="mx-1 h-6" />;
}

export function DrawingToolbar({
  settings,
  onSettingsChange,
  onClear,
}: DrawingToolbarProps) {
  const handleToolChange = (tool: DrawingTool) => {
    onSettingsChange({ ...settings, tool });
  };

  const handleColorChange = (color: string) => {
    onSettingsChange({ ...settings, color });
  };

  const handleWidthChange = (width: number) => {
    onSettingsChange({ ...settings, width });
  };

  const handleClear = () => {
    const confirmed = window.confirm(
      'Are you sure you want to clear the drawing? This cannot be undone.',
    );
    if (confirmed) {
      onClear();
    }
  };

  return (
    <div className="flex items-center gap-0.5 px-2 py-1">
      {/* Tool group */}
      {(['pen', 'eraser'] as const).map((tool) => (
        <Button
          key={tool}
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={tool === 'pen' ? 'Pen tool' : 'Eraser tool'}
          className={cn(settings.tool === tool && 'ring-2 ring-primary')}
          onClick={() => handleToolChange(tool)}
        >
          {TOOL_ICONS[tool]}
        </Button>
      ))}

      <VerticalSeparator />

      {/* Color group */}
      {DEFAULT_COLORS.map((color) => (
        <Button
          key={color}
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={`Color ${color}`}
          className={cn(settings.color === color && 'ring-2 ring-primary')}
          onClick={() => handleColorChange(color)}
        >
          <span
            className="size-3 rounded-full"
            style={{ backgroundColor: color }}
          />
        </Button>
      ))}

      <VerticalSeparator />

      {/* Width group */}
      {DEFAULT_WIDTHS.map((width) => (
        <Button
          key={width}
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={`Width ${width}`}
          className={cn(settings.width === width && 'ring-2 ring-primary')}
          onClick={() => handleWidthChange(width)}
        >
          <Minus className={WIDTH_ICON_SIZES[width]} />
        </Button>
      ))}

      <VerticalSeparator />

      {/* Clear button */}
      <Button
        type="button"
        variant="destructive"
        size="icon-xs"
        aria-label="Clear drawing"
        onClick={handleClear}
      >
        <Trash2 />
      </Button>
    </div>
  );
}
