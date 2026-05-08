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
  Link,
  Code,
  Minus,
  Quote,
  Download,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { HeadingDropdown } from './heading-dropdown';
import { useExportPdf } from '@/hooks/use-export-pdf';
import type { ExportableDocument } from '@/lib/pdf/export-pdf';
import { useCallback, useEffect, useRef, useState } from 'react';

interface EditorToolbarProps {
  editor: Editor;
  hideUndoRedo?: boolean;
  compact?: boolean;
  document?: ExportableDocument;
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
  const [popoverPos, setPopoverPos] = useState<{
    top: number;
    left: number;
  } | null>(null);

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

  const handleToggle = () => {
    if (!open && ref.current) {
      const rect = ref.current.getBoundingClientRect();
      setPopoverPos({ top: rect.bottom + 4, left: rect.left + rect.width / 2 });
    }
    setOpen((o) => !o);
  };

  return (
    <div className="relative" ref={ref}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleToggle}
            className={
              editor.isActive('highlight')
                ? 'bg-accent text-accent-foreground'
                : ''
            }
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
      {open && popoverPos && (
        <div
          className="fixed p-2 bg-popover border rounded-lg shadow-lg z-[100] -translate-x-1/2"
          style={{ top: popoverPos.top, left: popoverPos.left }}
        >
          <div className="flex gap-1.5">
            {TEXT_HIGHLIGHT_COLORS.map((c) => (
              <button
                key={c.label}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  if (c.value === '') {
                    editor.chain().focus().unsetHighlight().run();
                  } else {
                    editor
                      .chain()
                      .focus()
                      .toggleHighlight({ color: c.value })
                      .run();
                  }
                  setOpen(false);
                }}
                className={`h-6 w-6 rounded-full border-2 transition-transform hover:scale-110 ${
                  activeColor === c.value
                    ? 'border-primary ring-2 ring-primary/30'
                    : 'border-gray-200'
                }`}
                style={{
                  backgroundColor: c.value || '#ffffff',
                  backgroundImage:
                    c.value === ''
                      ? 'linear-gradient(135deg, transparent 45%, #ef4444 45%, #ef4444 55%, transparent 55%)'
                      : undefined,
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

/**
 * If the selection end sits at position 0 of the next paragraph (common when
 * selecting to end of line), pull it back so alignment only affects the
 * paragraphs the user actually selected.
 */
const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 72];
const DEFAULT_FONT_SIZE = 16;

function getCurrentFontSize(editor: Editor): number {
  const attrs = editor.getAttributes('textStyle');
  if (attrs.fontSize) {
    return parseInt(attrs.fontSize, 10) || DEFAULT_FONT_SIZE;
  }
  return DEFAULT_FONT_SIZE;
}

function FontSizeControl({ editor }: { editor: Editor }) {
  const currentSize = getCurrentFontSize(editor);

  const decrease = () => {
    const idx = FONT_SIZES.findIndex((s) => s >= currentSize);
    const newSize = FONT_SIZES[Math.max(0, (idx > 0 ? idx : 1) - 1)];
    editor.chain().focus().setFontSize(`${newSize}px`).run();
  };

  const increase = () => {
    const idx = FONT_SIZES.findIndex((s) => s >= currentSize);
    const next = idx >= 0 ? idx + 1 : FONT_SIZES.length - 1;
    const newSize = FONT_SIZES[Math.min(next, FONT_SIZES.length - 1)];
    editor.chain().focus().setFontSize(`${newSize}px`).run();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    if (val > 0 && val <= 200) {
      editor.chain().focus().setFontSize(`${val}px`).run();
    }
  };

  return (
    <div className="flex items-center gap-0.5">
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        onMouseDown={(e) => e.preventDefault()}
        onClick={decrease}
        aria-label="Decrease font size"
      >
        <span className="text-xs font-bold">−</span>
      </Button>
      <input
        type="text"
        value={currentSize}
        onChange={handleInputChange}
        onMouseDown={(e) => e.stopPropagation()}
        className="w-8 h-6 text-center text-xs border rounded bg-background"
        aria-label="Font size"
      />
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        onMouseDown={(e) => e.preventDefault()}
        onClick={increase}
        aria-label="Increase font size"
      >
        <span className="text-xs font-bold">+</span>
      </Button>
    </div>
  );
}

function trimSelectionToBlock(editor: Editor) {
  const { state } = editor;
  const { from, to } = state.selection;
  if (from === to) return; // collapsed cursor — nothing to trim

  const $to = state.doc.resolve(to);
  // If selection end is at the very start of a textblock, pull back by 1
  if ($to.parentOffset === 0 && to > from) {
    editor.commands.setTextSelection({ from, to: to - 1 });
  }
}

export function EditorToolbar({
  editor,
  hideUndoRedo,
  compact,
  document,
}: EditorToolbarProps) {
  const { exportPdf, isExporting } = useExportPdf();

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
    <div className={`glass-panel flex items-center gap-0.5 px-5 py-2 w-fit max-w-full overflow-x-auto rounded-2xl border border-white/60 shadow-lg ${compact ? '' : 'mx-auto my-2'}`}>
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

      {/* Font size */}
      <FontSizeControl editor={editor} />

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

      {/* Alignment — trims selection to avoid bleeding into next paragraph */}
      <ToolbarButton
        onClick={() => {
          trimSelectionToBlock(editor);
          editor.chain().focus().setTextAlign('left').run();
        }}
        isActive={editor.isActive({ textAlign: 'left' })}
        icon={<AlignLeft />}
        label="Align left"
      />
      <ToolbarButton
        onClick={() => {
          trimSelectionToBlock(editor);
          editor.chain().focus().setTextAlign('center').run();
        }}
        isActive={editor.isActive({ textAlign: 'center' })}
        icon={<AlignCenter />}
        label="Align center"
      />
      <ToolbarButton
        onClick={() => {
          trimSelectionToBlock(editor);
          editor.chain().focus().setTextAlign('right').run();
        }}
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

      {/* Export PDF */}
      {document && (
        <>
          <VerticalSeparator />
          <ToolbarButton
            onClick={() => exportPdf(document)}
            disabled={isExporting}
            icon={
              isExporting ? <Loader2 className="animate-spin" /> : <Download />
            }
            label="Export as PDF"
          />
        </>
      )}
    </div>
  );
}
