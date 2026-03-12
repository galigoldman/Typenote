'use client';

/**
 * Small visual thumbnail previewing a page pattern (blank, lined, grid, dotted).
 * Used in both the create-document dialog and the add-page popover.
 */
export function PageTypeThumb({
  type,
  size = 48,
}: {
  type: string;
  size?: number;
}) {
  const h = Math.round(size * 1.414); // A4 aspect ratio
  const gap = size > 40 ? 8 : 6;
  const stroke = '#d1d5db';

  const rows = Math.floor(h / gap);
  const cols = Math.floor(size / gap);

  return (
    <svg
      width={size}
      height={h}
      viewBox={`0 0 ${size} ${h}`}
      className="rounded border border-gray-200 bg-white"
    >
      {type === 'lined' &&
        Array.from({ length: rows }, (_, i) => (
          <line
            key={i}
            x1={0}
            y1={(i + 1) * gap}
            x2={size}
            y2={(i + 1) * gap}
            stroke={stroke}
            strokeWidth={0.5}
          />
        ))}

      {type === 'grid' && (
        <>
          {Array.from({ length: rows }, (_, i) => (
            <line
              key={`h${i}`}
              x1={0}
              y1={(i + 1) * gap}
              x2={size}
              y2={(i + 1) * gap}
              stroke={stroke}
              strokeWidth={0.5}
            />
          ))}
          {Array.from({ length: cols }, (_, i) => (
            <line
              key={`v${i}`}
              x1={(i + 1) * gap}
              y1={0}
              x2={(i + 1) * gap}
              y2={h}
              stroke={stroke}
              strokeWidth={0.5}
            />
          ))}
        </>
      )}

      {type === 'dotted' &&
        Array.from({ length: rows * cols }, (_, i) => {
          const row = Math.floor(i / cols);
          const col = i % cols;
          return (
            <circle
              key={i}
              cx={(col + 1) * gap}
              cy={(row + 1) * gap}
              r={size > 40 ? 0.8 : 0.6}
              fill={stroke}
            />
          );
        })}
    </svg>
  );
}
