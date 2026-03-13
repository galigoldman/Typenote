'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Link from '@tiptap/extension-link';
import type { Document } from '@/types/database';
import type { SaveStatus } from '@/hooks/use-auto-save';
import type { ConnectionStatus } from '@/hooks/use-realtime-sync';
import { useDocumentSync } from '@/hooks/use-document-sync';
import { AutoDirection } from '@/lib/editor/rtl-extension';
import { MathExpression } from '@/lib/editor/math-extension';
import { MathInputBox } from '@/lib/editor/math-input-box';
import { EditorToolbar } from './editor-toolbar';
import { toast } from 'sonner';
import 'katex/dist/katex.min.css';

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

function ConnectionIndicator({
  status,
  isLockedByRemote,
}: {
  status: ConnectionStatus;
  isLockedByRemote: boolean;
}) {
  if (isLockedByRemote) {
    return (
      <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <span className="inline-block h-2 w-2 rounded-full bg-yellow-500" />
        Editing elsewhere
      </span>
    );
  }

  const config: Record<ConnectionStatus, { color: string; label: string }> = {
    connected: { color: 'bg-green-500', label: 'Synced' },
    connecting: { color: 'bg-yellow-500', label: 'Connecting' },
    disconnected: { color: 'bg-red-500', label: 'Disconnected' },
  };

  const { color, label } = config[status];

  return (
    <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
      <span className={`inline-block h-2 w-2 rounded-full ${color}`} />
      {label}
    </span>
  );
}

export function TiptapEditor({ document }: TiptapEditorProps) {
  const [title, setTitle] = useState(document.title);
  const [mathInputPosition, setMathInputPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const skipNextUpdateRef = useRef(false);

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
      MathExpression,
    ],
    content: document.content as Record<string, unknown>,
    editorProps: {
      attributes: {
        class:
          'prose prose-sm sm:prose-base max-w-none focus:outline-none min-h-[500px] p-4',
      },
    },
    onUpdate: () => {
      if (skipNextUpdateRef.current) {
        skipNextUpdateRef.current = false;
        return;
      }
      triggerSave();
    },
  });

  const onRemoteTitleUpdate = useCallback((remoteTitle: string) => {
    setTitle(remoteTitle);
  }, []);

  const {
    saveStatus,
    connectionStatus,
    isLockedByRemote,
    unlockEditor,
    triggerSave,
    flushSave,
    saveTitle,
  } = useDocumentSync({
    documentId: document.id,
    editor,
    onRemoteTitleUpdate,
  });

  const handleTitleBlur = async () => {
    if (title !== document.title) {
      await saveTitle(title);
    }
  };

  const handleTakeOver = () => {
    unlockEditor();
    editor?.setEditable(true);
    editor?.commands.focus();
  };

  // Listen for math input trigger from ProseMirror plugin
  useEffect(() => {
    const handleMathTrigger = (e: Event) => {
      const detail = (e as CustomEvent).detail as { x: number; y: number };
      setMathInputPosition(detail);
    };
    window.addEventListener('math-input-trigger', handleMathTrigger);
    return () => {
      window.removeEventListener('math-input-trigger', handleMathTrigger);
    };
  }, []);

  const handleMathSubmit = useCallback(
    async (text: string) => {
      if (!editor) return;
      try {
        const res = await fetch('/api/ai/latex', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        });
        if (!res.ok) {
          throw new Error('Conversion failed');
        }
        const data = await res.json();
        editor.chain().focus().insertMath(data.latex, text).run();
        setMathInputPosition(null);
        // Flush save immediately so the LaTeX is persisted and synced right away
        await flushSave();
      } catch {
        toast.error('Failed to convert math expression');
        setMathInputPosition(null);
      }
    },
    [editor, flushSave],
  );

  const handleMathCancel = useCallback(() => {
    setMathInputPosition(null);
    editor?.commands.focus();
  }, [editor]);

  // Toggle editor editability based on remote lock
  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!isLockedByRemote);
  }, [editor, isLockedByRemote]);

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
        <div className="flex items-center gap-3">
          <ConnectionIndicator
            status={connectionStatus}
            isLockedByRemote={isLockedByRemote}
          />
          <SaveIndicator status={saveStatus} />
        </div>
      </div>

      {/* Remote editing lock banner */}
      {isLockedByRemote && (
        <div className="flex items-center justify-between bg-yellow-50 border-b border-yellow-200 px-4 py-2 text-sm text-yellow-800">
          <span>This document is being edited on another device.</span>
          <button
            onClick={handleTakeOver}
            className="font-medium underline hover:text-yellow-900"
          >
            Take over editing
          </button>
        </div>
      )}

      {/* Toolbar */}
      <EditorToolbar
        editor={editor}
        document={{ ...document, content: editor.getJSON() }}
      />

      {/* Editor Canvas */}
      <div className={`flex-1 overflow-y-auto ${canvasClass}`}>
        <EditorContent editor={editor} />
      </div>

      {/* Math Input Box */}
      {mathInputPosition && (
        <MathInputBox
          position={mathInputPosition}
          onSubmit={handleMathSubmit}
          onCancel={handleMathCancel}
        />
      )}

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
