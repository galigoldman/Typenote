import { createClient } from '@/lib/supabase/server';
import type { Folder } from '@/types/database';

export async function getFoldersByParent(parentId: string | null) {
  const supabase = await createClient();
  const query = supabase.from('folders').select('*').order('position');

  if (parentId) {
    query.eq('parent_id', parentId);
  } else {
    query.is('parent_id', null);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
}

export async function getFolder(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('folders')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function getFolderBreadcrumbs(
  folderId: string,
): Promise<Folder[]> {
  const supabase = await createClient();
  const breadcrumbs: Folder[] = [];
  let currentId: string | null = folderId;

  while (currentId) {
    const result = await supabase
      .from('folders')
      .select('*')
      .eq('id', currentId)
      .single();

    if (result.error) throw new Error(result.error.message);

    const folder = result.data as Folder;
    breadcrumbs.unshift(folder);
    currentId = folder.parent_id;
  }

  return breadcrumbs;
}
