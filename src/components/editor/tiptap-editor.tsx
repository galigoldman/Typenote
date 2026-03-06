'use client';

import { useCallback, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import type { Document } from '@/types/database';
import { useAutoSave, type SaveStatus } from '@/hooks/use-auto-save';
import {
  updateDocumentContent,
  updateDocumentTitle,
} from '@/lib/actions/documents';
import { AutoDirection } from '@/lib/editor/rtl-extension';

interface TiptapEditorProps {
  document: Document;
}

const CANVAS_CLASSES: Record<string, string> = {
  blank: '',
  lined: 'canvas-lined',
  grid: 'canvas-grid',
};

function SaveIndicator({ status }: { status: SaveStatus }) {
  const labels: Record<SaveStatus, string> = {
    saved: 'Saved',
    saving: 'Saving...',
    unsaved: 'Unsaved',
  };

  const colors: Record<SaveStatus, string> = {
    saved: 'text-green-600',
    saving: 'text-yellow-600',
    unsaved: 'text-red-600',
  };

  return <span className={`text-sm ${colors[status]}`}>{labels[status]}</span>;
}

export function TiptapEditor({ document }: TiptapEditorProps) {
  const [title, setTitle] = useState(document.title);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
        bulletList: {},
        orderedList: {},
        bold: {},
        italic: {},
      }),
      AutoDirection,
    ],
    content: document.content as Record<string, unknown>,
    editorProps: {
      attributes: {
        class:
          'prose prose-sm sm:prose-base max-w-none focus:outline-none min-h-[500px] p-4',
      },
    },
    onUpdate: () => {
      trigger();
    },
  });

  const saveFn = useCallback(async () => {
    if (!editor) return;
    const content = editor.getJSON() as Record<string, unknown>;
    await updateDocumentContent(document.id, content);
  }, [editor, document.id]);

  const { status, trigger } = useAutoSave(saveFn);

  const handleTitleBlur = async () => {
    if (title !== document.title) {
      await updateDocumentTitle(document.id, title);
    }
  };

  if (!editor) return null;

  const canvasClass = CANVAS_CLASSES[document.canvas_type] ?? '';

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-2">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={handleTitleBlur}
          className="text-xl font-semibold bg-transparent border-none outline-none flex-1"
          placeholder="Untitled"
        />
        <SaveIndicator status={status} />
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-1 border-b px-4 py-2 flex-wrap">
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={`px-2 py-1 rounded text-sm font-medium ${
            editor.isActive('bold')
              ? 'bg-gray-200 dark:bg-gray-700'
              : 'hover:bg-gray-100 dark:hover:bg-gray-800'
          }`}
          aria-label="Bold"
        >
          B
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={`px-2 py-1 rounded text-sm ${
            editor.isActive('italic')
              ? 'bg-gray-200 dark:bg-gray-700'
              : 'hover:bg-gray-100 dark:hover:bg-gray-800'
          }`}
          aria-label="Italic"
        >
          <em>I</em>
        </button>
        <button
          type="button"
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 1 }).run()
          }
          className={`px-2 py-1 rounded text-sm ${
            editor.isActive('heading', { level: 1 })
              ? 'bg-gray-200 dark:bg-gray-700'
              : 'hover:bg-gray-100 dark:hover:bg-gray-800'
          }`}
          aria-label="Heading 1"
        >
          H1
        </button>
        <button
          type="button"
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 2 }).run()
          }
          className={`px-2 py-1 rounded text-sm ${
            editor.isActive('heading', { level: 2 })
              ? 'bg-gray-200 dark:bg-gray-700'
              : 'hover:bg-gray-100 dark:hover:bg-gray-800'
          }`}
          aria-label="Heading 2"
        >
          H2
        </button>
        <button
          type="button"
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 3 }).run()
          }
          className={`px-2 py-1 rounded text-sm ${
            editor.isActive('heading', { level: 3 })
              ? 'bg-gray-200 dark:bg-gray-700'
              : 'hover:bg-gray-100 dark:hover:bg-gray-800'
          }`}
          aria-label="Heading 3"
        >
          H3
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={`px-2 py-1 rounded text-sm ${
            editor.isActive('bulletList')
              ? 'bg-gray-200 dark:bg-gray-700'
              : 'hover:bg-gray-100 dark:hover:bg-gray-800'
          }`}
          aria-label="Bullet List"
        >
          Bullet List
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={`px-2 py-1 rounded text-sm ${
            editor.isActive('orderedList')
              ? 'bg-gray-200 dark:bg-gray-700'
              : 'hover:bg-gray-100 dark:hover:bg-gray-800'
          }`}
          aria-label="Ordered List"
        >
          Ordered List
        </button>
      </div>

      {/* Editor Canvas */}
      <div className={`flex-1 overflow-y-auto ${canvasClass}`}>
        <EditorContent editor={editor} />
      </div>

      {/* Canvas background styles */}
      <style jsx global>{`
        .canvas-lined {
          background-image: repeating-linear-gradient(
            transparent,
            transparent 31px,
            #e5e7eb 31px,
            #e5e7eb 32px
          );
          background-size: 100% 32px;
        }
        .canvas-grid {
          background-image:
            linear-gradient(#e5e7eb 1px, transparent 1px),
            linear-gradient(90deg, #e5e7eb 1px, transparent 1px);
          background-size: 32px 32px;
        }
      `}</style>
    </div>
  );
}
