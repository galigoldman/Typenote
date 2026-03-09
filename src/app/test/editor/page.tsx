'use client';

import { redirect } from 'next/navigation';
import { TiptapEditor } from '@/components/editor/tiptap-editor';
import type { Document } from '@/types/database';

const mockDocument: Document = {
  id: 'test-doc-1',
  user_id: 'test-user-1',
  folder_id: null,
  course_id: null,
  week_id: null,
  purpose: null,
  title: 'Test Document',
  content: {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'Hello world' }],
      },
    ],
  },
  subject: 'other',
  subject_custom: 'Testing',
  canvas_type: 'blank',
  position: 0,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

export default function TestEditorPage() {
  if (process.env.NODE_ENV === 'production') {
    redirect('/');
  }

  return (
    <div className="h-screen">
      <TiptapEditor document={mockDocument} />
    </div>
  );
}
