'use client';

import { useRef, useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import UnderlineExt from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import LinkExt from '@tiptap/extension-link';
import { TextStyle } from '@tiptap/extension-text-style';
import { AutoDirection } from '@/lib/editor/rtl-extension';
import { Indent } from '@/lib/editor/indent-extension';
import { FontSize } from '@/lib/editor/font-size-extension';
import type { TextBox as TextBoxData } from '@/types/canvas';
import type { Editor } from '@tiptap/core';

interface TextBoxProps {
  textBox: TextBoxData;
  isSelected: boolean;
  readOnly?: boolean;
  onContentUpdate: (id: string, content: Record<string, unknown>) => void;
  onEditorReady?: (editor: Editor) => void;
  onHeightMeasured?: (id: string, height: number) => void;
}

export function TextBox({
  textBox,
  isSelected,
  readOnly = false,
  onContentUpdate,
  onEditorReady,
  onHeightMeasured,
}: TextBoxProps) {
  // Store callbacks in refs so the TipTap editor instance (created once)
  // always calls the latest version without needing to be re-created.
  const onContentUpdateRef = useRef(onContentUpdate);
  const onEditorReadyRef = useRef(onEditorReady);
  const onHeightMeasuredRef = useRef(onHeightMeasured);
  const textBoxIdRef = useRef(textBox.id);
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    onContentUpdateRef.current = onContentUpdate;
    onEditorReadyRef.current = onEditorReady;
    onHeightMeasuredRef.current = onHeightMeasured;
    textBoxIdRef.current = textBox.id;
  });

  // Sanitize content: ProseMirror crashes on { type: 'doc', content: [] }
  const safeContent = (() => {
    const c = textBox.content as { type?: string; content?: unknown[] } | null;
    if (!c || !c.content || c.content.length === 0) return undefined;
    return c as Record<string, unknown>;
  })();

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      UnderlineExt,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      TaskList,
      TaskItem.configure({ nested: true }),
      LinkExt.configure({
        openOnClick: false,
        HTMLAttributes: { class: 'text-primary underline cursor-pointer' },
      }),
      TextStyle,
      FontSize,
      AutoDirection,
      Indent,
    ],
    content: safeContent,
    editorProps: {
      attributes: {
        class: 'prose prose-sm sm:prose-base max-w-none focus:outline-none p-2',
      },
    },
    onUpdate: ({ editor: ed }) => {
      onContentUpdateRef.current(
        textBoxIdRef.current,
        ed.getJSON() as Record<string, unknown>,
      );
    },
    onFocus: ({ editor: ed }) => {
      onEditorReadyRef.current?.(ed);
    },
  });

  // Notify parent when editor is first created
  useEffect(() => {
    if (editor) {
      onEditorReadyRef.current?.(editor);
    }
  }, [editor]);

  // In Read mode, make the editor non-editable (text is selectable but not modifiable)
  useEffect(() => {
    if (!editor) return;
    const shouldBeEditable = !readOnly;
    if (editor.isEditable !== shouldBeEditable) {
      editor.setEditable(shouldBeEditable);
    }
  }, [readOnly, editor]);

  // Auto-measure content height so the selection bbox stays tight.
  // Uses ResizeObserver to detect when content changes size.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const measured = el.scrollHeight;
      if (measured > 0) {
        onHeightMeasuredRef.current?.(textBoxIdRef.current, measured);
      }
    };
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    // Initial measurement after mount
    measure();
    return () => observer.disconnect();
  }, [editor]);

  const fontScale = textBox.fontScale;

  return (
    <div
      ref={containerRef}
      data-textbox-id={textBox.id}
      className={`absolute ${
        isSelected
          ? 'border-2 border-blue-500 shadow-sm'
          : 'border border-transparent'
      }`}
      style={{
        left: textBox.x,
        top: textBox.y,
        width: textBox.width,
        minHeight: textBox.height,
      }}
    >
      {/* Wrapper that scales font. Uses a CSS variable + inline style on the
          ProseMirror element via the [style] selector to override rem-based
          prose classes. The wrapper sets font-size which child elements inherit. */}
      <div
        style={
          fontScale && fontScale !== 1
            ? { fontSize: `${fontScale}rem` }
            : undefined
        }
        className={
          fontScale && fontScale !== 1
            ? '[&_.ProseMirror]:!text-[length:inherit]'
            : undefined
        }
      >
        {editor && <EditorContent editor={editor} />}
      </div>
    </div>
  );
}
