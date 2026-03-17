'use client';

import { useRef } from 'react';
import { Sparkles } from 'lucide-react';

interface FloatingActionBarProps {
  position: { x: number; y: number };
  visible: boolean;
  onAskAi: () => void;
}

export function FloatingActionBar({
  position,
  visible,
  onAskAi,
}: FloatingActionBarProps) {
  const barRef = useRef<HTMLDivElement>(null);

  if (!visible) return null;

  // Adjust Y: flip below if too close to top
  const y = position.y < 10 ? position.y + 50 : position.y;

  return (
    <div
      ref={barRef}
      className="fixed z-[100] flex items-center gap-1 rounded-full border bg-white px-2 py-1 shadow-lg"
      style={{
        left: position.x,
        top: y,
        transform: 'translate(-50%, -100%)',
      }}
    >
      <button
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onAskAi();
        }}
        className="flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium text-purple-700 transition-colors hover:bg-purple-50"
      >
        <Sparkles className="h-3.5 w-3.5" />
        Ask AI
      </button>
    </div>
  );
}
