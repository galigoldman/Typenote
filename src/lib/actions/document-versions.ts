'use server';

import { createClient } from '@/lib/supabase/server';
import type { DocumentVersion, VersionTrigger } from '@/types/database';

export async function createVersionSnapshot(
  documentId: string,
  trigger: Exclude<VersionTrigger, 'before_restore'>,
): Promise<{ id: string; created_at: string } | null> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc('create_document_version', {
    p_document_id: documentId,
    p_trigger: trigger,
  });

  if (error) {
    // Document not found or user doesn't own it — return null instead of throwing
    if (error.message.includes('Document not found')) return null;
    throw new Error(error.message);
  }

  const row = data?.[0];
  if (!row) return null;

  return {
    id: row.version_id,
    created_at: row.version_created_at,
  };
}

export async function restoreDocumentVersion(
  versionId: string,
): Promise<{ updated_at: string }> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc('restore_document_version', {
    p_version_id: versionId,
  });

  if (error) throw new Error(error.message);

  const row = data?.[0];
  if (!row) throw new Error('Restore failed');

  return { updated_at: row.doc_updated_at };
}

export async function fetchDocumentVersions(
  documentId: string,
): Promise<DocumentVersion[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('document_versions')
    .select('*')
    .eq('document_id', documentId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as DocumentVersion[];
}
