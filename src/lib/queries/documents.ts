import { createClient } from '@/lib/supabase/server';

export async function getDocumentsByFolder(folderId: string | null) {
  const supabase = await createClient();
  const query = supabase.from('documents').select('*').order('position');

  if (folderId) {
    query.eq('folder_id', folderId);
  } else {
    query.is('folder_id', null);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
}

export async function getDocument(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw new Error(error.message);
  return data;
}
