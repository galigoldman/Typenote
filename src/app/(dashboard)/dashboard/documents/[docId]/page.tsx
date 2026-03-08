import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { CanvasEditor } from '@/components/canvas/canvas-editor';
import type { Document } from '@/types/database';

interface DocumentPageProps {
  params: Promise<{ docId: string }>;
}

export default async function DocumentPage({ params }: DocumentPageProps) {
  const { docId } = await params;
  const supabase = await createClient();

  const { data: document, error } = await supabase
    .from('documents')
    .select('*')
    .eq('id', docId)
    .single();

  if (error || !document) {
    redirect('/dashboard');
  }

  const doc = document as Document;

  return <CanvasEditor document={doc} />;
}
