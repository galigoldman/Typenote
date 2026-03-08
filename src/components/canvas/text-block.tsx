'use client';

import { useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Link from '@tiptap/extension-link';
import { useEditorManager } from '@/lib/canvas/editor-manager';

interface TextBlockProps {
  elementId: string;
  content: Record<string, unknown>;
  onContentChange: (elementId: string, content: Record<string, unknown>) => void;
}

export function TextBlock({ elementId, content, onContentChange }: TextBlockProps) {
  const editorManager = useEditorManager();

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        undoRedo: false, // Global undo/redo handled by HistoryManager
      }),
      Underline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Link.configure({ openOnClick: false }),
    ],
    immediatelyRender: false,
    content,
    onUpdate: ({ editor }) => {
      onContentChange(elementId, editor.getJSON());
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none outline-none p-3 h-full',
      },
    },
  });

  // Register with EditorManager
  useEffect(() => {
    if (editor) {
      editorManager.register(elementId, editor);
      return () => {
        editorManager.unregister(elementId);
      };
    }
  }, [editor, elementId, editorManager]);

  // Stop pointer events from propagating to canvas viewport
  // when clicking inside the editor
  const handlePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
  };

  if (!editor) {
    return null;
  }

  return (
    <div
      className="h-full w-full overflow-auto"
      onPointerDown={handlePointerDown}
    >
      <EditorContent editor={editor} />
    </div>
  );
}
