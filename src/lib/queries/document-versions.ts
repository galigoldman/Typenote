import { createClient } from '@/lib/supabase/server';
import type { DocumentVersion } from '@/types/database';

export async function getDocumentVersions(
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
