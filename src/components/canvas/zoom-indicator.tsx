'use client';

interface ZoomIndicatorProps {
  scale: number;
  visible: boolean;
}

export function ZoomIndicator({ scale, visible }: ZoomIndicatorProps) {
  if (scale === 1 && !visible) return null;

  const percentage = Math.round(scale * 100);

  return (
    <div
      className={`fixed bottom-20 left-1/2 -translate-x-1/2 z-50 px-3 py-1.5
        bg-black/70 text-white text-sm font-medium rounded-full
        transition-opacity duration-500 pointer-events-none
        ${visible ? 'opacity-100' : 'opacity-0'}`}
    >
      {percentage}%
    </div>
  );
}
