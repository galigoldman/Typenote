import type { SVGProps } from 'react';

export function AiHeadIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {/* Head profile silhouette */}
      <path d="M12 2C7.5 2 4 5.5 4 9.5c0 2.5 1.2 4.7 3 6v2.5c0 1.1.9 2 2 2h1v-3h4v3h1c1.1 0 2-.9 2-2V15c1.5-1.5 3-3.5 3-6 0-4-3-7-8-7z" />
      {/* Gear/cog inside the head */}
      <circle cx="12" cy="9.5" r="2" />
      <path d="M12 6.5v-1M12 13.5v-1" />
      <path d="M9.4 7.6l-.7-.7M15.3 12.1l-.7-.7" />
      <path d="M9 9.5H8M16 9.5h-1" />
      <path d="M9.4 11.4l-.7.7M15.3 6.9l-.7.7" />
    </svg>
  );
}
