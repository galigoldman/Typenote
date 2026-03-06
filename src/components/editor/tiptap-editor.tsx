'use client';

import { useCallback, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Link from '@tiptap/extension-link';
import type { Document } from '@/types/database';
import { useAutoSave, type SaveStatus } from '@/hooks/use-auto-save';
import {
  updateDocumentContent,
  updateDocumentTitle,
} from '@/lib/actions/documents';
import { AutoDirection } from '@/lib/editor/rtl-extension';
import { EditorToolbar } from './editor-toolbar';

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
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Underline,
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-primary underline cursor-pointer',
        },
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
      <EditorToolbar editor={editor} />

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
