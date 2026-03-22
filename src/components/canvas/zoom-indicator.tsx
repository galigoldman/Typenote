'use client';

interface ZoomIndicatorProps {
  percent: number;
  visible: boolean;
}

export function ZoomIndicator({ percent, visible }: ZoomIndicatorProps) {
  if (percent === 100 && !visible) return null;

  return (
    <div
      className={`fixed bottom-20 left-1/2 -translate-x-1/2 z-50 px-3 py-1.5
        bg-black/70 text-white text-sm font-medium rounded-full
        transition-opacity duration-500 pointer-events-none
        ${visible ? 'opacity-100' : 'opacity-0'}`}
    >
      {percent}%
    </div>
  );
}
