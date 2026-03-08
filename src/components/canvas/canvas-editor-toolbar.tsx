'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Editor } from '@tiptap/react';
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  AlignLeft,
  AlignCenter,
  AlignRight,
  List,
  ListOrdered,
  Link,
  Code,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useEditorManager } from '@/lib/canvas/editor-manager';

interface ToolbarButtonProps {
  onClick: () => void;
  isActive?: boolean;
  disabled?: boolean;
  icon: React.ReactNode;
  label: string;
}

function ToolbarButton({
  onClick,
  isActive,
  disabled,
  icon,
  label,
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
        <p>{label}</p>
      </TooltipContent>
    </Tooltip>
  );
}

function VerticalSeparator() {
  return <Separator orientation="vertical" className="mx-1 h-6" />;
}

/**
 * Canvas-specific formatting toolbar that binds to whichever TipTap editor
 * currently has focus. Hides when no editor is focused.
 */
export function CanvasEditorToolbar() {
  const editorManager = useEditorManager();
  const [activeEditor, setActiveEditor] = useState<Editor | null>(null);

  // Poll for focused editor — TipTap focus/blur events don't bubble
  // through the EditorManager, so we check on a short interval.
  useEffect(() => {
    const interval = setInterval(() => {
      const focused = editorManager.getFocused() ?? null;
      setActiveEditor((prev) => {
        if (prev === focused) return prev;
        return focused;
      });
    }, 100);
    return () => clearInterval(interval);
  }, [editorManager]);

  const setLink = useCallback(() => {
    if (!activeEditor) return;
    const previousUrl = activeEditor.getAttributes('link').href as string | undefined;
    const url = window.prompt('URL', previousUrl);
    if (url === null) return;
    if (url === '') {
      activeEditor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    activeEditor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  }, [activeEditor]);

  if (!activeEditor) return null;

  const editor = activeEditor;

  return (
    <div className="absolute left-1/2 top-3 z-50 flex -translate-x-1/2 items-center gap-0.5 rounded-lg border bg-background/90 px-2 py-1 shadow-sm backdrop-blur-sm">
      {/* Inline formatting */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBold().run()}
        isActive={editor.isActive('bold')}
        icon={<Bold />}
        label="Bold"
      />
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleItalic().run()}
        isActive={editor.isActive('italic')}
        icon={<Italic />}
        label="Italic"
      />
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        isActive={editor.isActive('underline')}
        icon={<Underline />}
        label="Underline"
      />
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleStrike().run()}
        isActive={editor.isActive('strike')}
        icon={<Strikethrough />}
        label="Strikethrough"
      />

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
    </div>
  );
}
