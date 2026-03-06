'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

export async function createDocument(data: {
  title: string;
  subject: string;
  subject_custom?: string;
  canvas_type: string;
  folder_id: string | null;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data: doc, error } = await supabase
    .from('documents')
    .insert({
      user_id: user.id,
      ...data,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  revalidatePath('/dashboard');
  return doc;
}

export async function updateDocument(
  id: string,
  data: {
    title?: string;
    subject?: string;
    subject_custom?: string | null;
    canvas_type?: string;
    content?: Record<string, unknown>;
  },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data: doc, error } = await supabase
    .from('documents')
    .update(data)
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  revalidatePath('/dashboard');
  return doc;
}

export async function deleteDocument(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('documents')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) throw new Error(error.message);
  revalidatePath('/dashboard');
}

export async function moveDocument(id: string, folderId: string | null) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data: doc, error } = await supabase
    .from('documents')
    .update({ folder_id: folderId })
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  revalidatePath('/dashboard');
  return doc;
}

export async function updateDocumentContent(
  id: string,
  content: Record<string, unknown>,
): Promise<{ updated_at: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('documents')
    .update({ content })
    .eq('id', id)
    .select('updated_at')
    .single();
  if (error) throw new Error(error.message);
  return { updated_at: data.updated_at };
}

export async function updateDocumentTitle(
  id: string,
  title: string,
): Promise<{ updated_at: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('documents')
    .update({ title })
    .eq('id', id)
    .select('updated_at')
    .single();
  if (error) throw new Error(error.message);
  return { updated_at: data.updated_at };
}
