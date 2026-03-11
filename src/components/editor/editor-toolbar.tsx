'use client';

import type { Editor } from '@tiptap/react';
import {
  Undo2,
  Redo2,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Highlighter,
  AlignLeft,
  AlignCenter,
  AlignRight,
  List,
  ListOrdered,
  ListChecks,
  Indent,
  Outdent,
  Link,
  Code,
  Minus,
  Quote,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { HeadingDropdown } from './heading-dropdown';
import { useCallback, useEffect, useRef, useState } from 'react';

interface EditorToolbarProps {
  editor: Editor;
  hideUndoRedo?: boolean;
}

interface ToolbarButtonProps {
  onClick: () => void;
  isActive?: boolean;
  disabled?: boolean;
  icon: React.ReactNode;
  label: string;
  shortcut?: string;
}

function ToolbarButton({
  onClick,
  isActive,
  disabled,
  icon,
  label,
  shortcut,
}: ToolbarButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onMouseDown={(e) => e.preventDefault()}
          onClick={onClick}
          disabled={disabled}
          className={isActive ? 'bg-accent text-accent-foreground' : ''}
          aria-label={label}
        >
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={5}>
        <p>
          {label}
          {shortcut && <span className="ml-2 opacity-60">{shortcut}</span>}
        </p>
      </TooltipContent>
    </Tooltip>
  );
}

function VerticalSeparator() {
  return <Separator orientation="vertical" className="mx-1 h-6" />;
}

const TEXT_HIGHLIGHT_COLORS = [
  { label: 'Yellow', value: '#fef08a' },
  { label: 'Green', value: '#bbf7d0' },
  { label: 'Blue', value: '#bfdbfe' },
  { label: 'Pink', value: '#fbcfe8' },
  { label: 'Purple', value: '#e9d5ff' },
  { label: 'Orange', value: '#fed7aa' },
  { label: 'None', value: '' },
];

function HighlightButton({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener('pointerdown', handler);
    return () => window.removeEventListener('pointerdown', handler);
  }, [open]);

  const activeColor = (editor.getAttributes('highlight').color as string) || '';

  return (
    <div className="relative" ref={ref}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setOpen((o) => !o)}
            className={editor.isActive('highlight') ? 'bg-accent text-accent-foreground' : ''}
            aria-label="Highlight"
          >
            <Highlighter />
            {activeColor && (
              <span
                className="absolute bottom-0.5 left-1/2 -translate-x-1/2 h-0.5 w-3.5 rounded-full"
                style={{ backgroundColor: activeColor }}
              />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={5}>
          <p>Highlight</p>
        </TooltipContent>
      </Tooltip>
      {open && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 p-2 bg-popover border rounded-lg shadow-lg z-50">
          <div className="flex gap-1.5">
            {TEXT_HIGHLIGHT_COLORS.map((c) => (
              <button
                key={c.label}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  if (c.value === '') {
                    editor.chain().focus().unsetHighlight().run();
                  } else {
                    editor.chain().focus().toggleHighlight({ color: c.value }).run();
                  }
                  setOpen(false);
                }}
                className={`h-6 w-6 rounded-full border-2 transition-transform hover:scale-110 ${
                  activeColor === c.value ? 'border-primary ring-2 ring-primary/30' : 'border-gray-200'
                }`}
                style={{
                  backgroundColor: c.value || '#ffffff',
                  backgroundImage: c.value === '' ? 'linear-gradient(135deg, transparent 45%, #ef4444 45%, #ef4444 55%, transparent 55%)' : undefined,
                }}
                title={c.label}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function EditorToolbar({ editor, hideUndoRedo }: EditorToolbarProps) {
  const setLink = useCallback(() => {
    const previousUrl = editor.getAttributes('link').href as string | undefined;
    const url = window.prompt('URL', previousUrl);
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  }, [editor]);

  return (
    <div className="flex items-center gap-0.5 border-b px-2 py-1 flex-wrap">
      {/* History */}
      {!hideUndoRedo && (
        <>
          <ToolbarButton
            onClick={() => editor.chain().focus().undo().run()}
            disabled={!editor.can().undo()}
            icon={<Undo2 />}
            label="Undo"
            shortcut="Ctrl+Z"
          />
          <ToolbarButton
            onClick={() => editor.chain().focus().redo().run()}
            disabled={!editor.can().redo()}
            icon={<Redo2 />}
            label="Redo"
            shortcut="Ctrl+Y"
          />
          <VerticalSeparator />
        </>
      )}

      {/* Block type */}
      <HeadingDropdown editor={editor} />

      <VerticalSeparator />

      {/* Inline formatting */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBold().run()}
        isActive={editor.isActive('bold')}
        icon={<Bold />}
        label="Bold"
        shortcut="Ctrl+B"
      />
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleItalic().run()}
        isActive={editor.isActive('italic')}
        icon={<Italic />}
        label="Italic"
        shortcut="Ctrl+I"
      />
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        isActive={editor.isActive('underline')}
        icon={<Underline />}
        label="Underline"
        shortcut="Ctrl+U"
      />
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleStrike().run()}
        isActive={editor.isActive('strike')}
        icon={<Strikethrough />}
        label="Strikethrough"
      />
      <HighlightButton editor={editor} />

      <VerticalSeparator />

      {/* Alignment */}
      <ToolbarButton
        onClick={() => editor.chain().focus().setTextAlign('left').run()}
        isActive={editor.isActive({ textAlign: 'left' })}
        icon={<AlignLeft />}
        label="Align left"
      />
      <ToolbarButton
        onClick={() => editor.chain().focus().setTextAlign('center').run()}
        isActive={editor.isActive({ textAlign: 'center' })}
        icon={<AlignCenter />}
        label="Align center"
      />
      <ToolbarButton
        onClick={() => editor.chain().focus().setTextAlign('right').run()}
        isActive={editor.isActive({ textAlign: 'right' })}
        icon={<AlignRight />}
        label="Align right"
      />

      <VerticalSeparator />

      {/* Lists */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        isActive={editor.isActive('bulletList')}
        icon={<List />}
        label="Bullet list"
      />
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        isActive={editor.isActive('orderedList')}
        icon={<ListOrdered />}
        label="Numbered list"
      />
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleTaskList().run()}
        isActive={editor.isActive('taskList')}
        icon={<ListChecks />}
        label="Task list"
      />

      <VerticalSeparator />

      {/* Indentation */}
      <ToolbarButton
        onClick={() => editor.chain().focus().sinkListItem('listItem').run()}
        disabled={!editor.can().sinkListItem('listItem')}
        icon={<Indent />}
        label="Indent"
      />
      <ToolbarButton
        onClick={() => editor.chain().focus().liftListItem('listItem').run()}
        disabled={!editor.can().liftListItem('listItem')}
        icon={<Outdent />}
        label="Outdent"
      />

      <VerticalSeparator />

      {/* Insert */}
      <ToolbarButton
        onClick={setLink}
        isActive={editor.isActive('link')}
        icon={<Link />}
        label="Link"
      />
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        isActive={editor.isActive('codeBlock')}
        icon={<Code />}
        label="Code block"
      />
      <ToolbarButton
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
        icon={<Minus />}
        label="Horizontal rule"
      />
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        isActive={editor.isActive('blockquote')}
        icon={<Quote />}
        label="Blockquote"
      />
    </div>
  );
}
