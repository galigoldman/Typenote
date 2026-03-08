'use client';

import type { CanvasBackground } from '@/lib/canvas/types';

const BASE_SPACING = 32;

interface BackgroundRendererProps {
  background: CanvasBackground;
  zoom: number;
}

function getBackgroundStyle(
  background: CanvasBackground,
  zoom: number
): React.CSSProperties {
  const spacing = BASE_SPACING * zoom;

  switch (background) {
    case 'lined': {
      return {
        backgroundImage: `repeating-linear-gradient(to bottom, transparent, transparent ${spacing - 1}px, #e5e7eb ${spacing - 1}px, #e5e7eb ${spacing}px)`,
      };
    }
    case 'grid': {
      return {
        backgroundImage: [
          `repeating-linear-gradient(to bottom, transparent, transparent ${spacing - 1}px, #e5e7eb ${spacing - 1}px, #e5e7eb ${spacing}px)`,
          `repeating-linear-gradient(to right, transparent, transparent ${spacing - 1}px, #e5e7eb ${spacing - 1}px, #e5e7eb ${spacing}px)`,
        ].join(', '),
      };
    }
    case 'dotted': {
      return {
        backgroundImage: `radial-gradient(circle, #d1d5db 1px, transparent 1px)`,
        backgroundSize: `${spacing}px ${spacing}px`,
      };
    }
    case 'blank':
    default:
      return {};
  }
}

export function BackgroundRenderer({
  background,
  zoom,
}: BackgroundRendererProps) {
  const patternStyle = getBackgroundStyle(background, zoom);

  return (
    <div
      data-testid="background-renderer"
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        ...patternStyle,
      }}
    />
  );
}
