'use client';

import type { Editor } from '@tiptap/react';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface HeadingDropdownProps {
  editor: Editor;
}

type Level = 1 | 2 | 3;

const headingOptions = [
  { label: 'Normal text', level: null, className: 'text-sm' },
  { label: 'Heading 1', level: 1 as Level, className: 'text-xl font-bold' },
  { label: 'Heading 2', level: 2 as Level, className: 'text-lg font-bold' },
  { label: 'Heading 3', level: 3 as Level, className: 'text-base font-bold' },
];

function getCurrentLabel(editor: Editor): string {
  for (const opt of headingOptions) {
    if (opt.level && editor.isActive('heading', { level: opt.level })) {
      return opt.label;
    }
  }
  return 'Normal text';
}

export function HeadingDropdown({ editor }: HeadingDropdownProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1 text-xs w-[130px] justify-between" onMouseDown={(e) => e.preventDefault()}>
          <span className="truncate">{getCurrentLabel(editor)}</span>
          <ChevronDown className="size-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[180px]">
        {headingOptions.map((opt) => (
          <DropdownMenuItem
            key={opt.label}
            className={opt.className}
            onSelect={() => {
              if (opt.level) {
                editor.chain().focus().toggleHeading({ level: opt.level }).run();
              } else {
                editor.chain().focus().setParagraph().run();
              }
            }}
          >
            {opt.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
