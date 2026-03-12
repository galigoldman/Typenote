'use client';

import { useRef, useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import UnderlineExt from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import LinkExt from '@tiptap/extension-link';
import { AutoDirection } from '@/lib/editor/rtl-extension';
import type { TextBox as TextBoxData } from '@/types/canvas';
import type { Editor } from '@tiptap/core';

interface TextBoxProps {
  textBox: TextBoxData;
  isSelected: boolean;
  onContentUpdate: (id: string, content: Record<string, unknown>) => void;
  onEditorReady?: (editor: Editor) => void;
}

export function TextBox({
  textBox,
  isSelected,
  onContentUpdate,
  onEditorReady,
}: TextBoxProps) {
  // Store callbacks in refs so the TipTap editor instance (created once)
  // always calls the latest version without needing to be re-created.
  const onContentUpdateRef = useRef(onContentUpdate);
  const onEditorReadyRef = useRef(onEditorReady);
  const textBoxIdRef = useRef(textBox.id);
  useEffect(() => {
    onContentUpdateRef.current = onContentUpdate;
    onEditorReadyRef.current = onEditorReady;
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
      AutoDirection,
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

  return (
    <div
      className={`absolute overflow-hidden ${
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
      {editor && <EditorContent editor={editor} />}
    </div>
  );
}
