'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

export async function createCourseMaterial(data: {
  week_id: string;
  category: 'material' | 'homework';
  storage_path: string;
  file_name: string;
  label?: string;
  file_size: number;
  mime_type: string;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data: material, error } = await supabase
    .from('course_materials')
    .insert({
      user_id: user.id,
      week_id: data.week_id,
      category: data.category,
      storage_path: data.storage_path,
      file_name: data.file_name,
      label: data.label,
      file_size: data.file_size,
      mime_type: data.mime_type,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  revalidatePath('/dashboard');
  return material;
}

export async function updateCourseMaterial(
  id: string,
  data: { label?: string },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data: material, error } = await supabase
    .from('course_materials')
    .update({
      label: data.label,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  revalidatePath('/dashboard');
  return material;
}

export async function deleteCourseMaterial(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data: material, error: fetchError } = await supabase
    .from('course_materials')
    .select('storage_path')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();
  if (fetchError) throw new Error(fetchError.message);

  const { error: storageError } = await supabase.storage
    .from('course-materials')
    .remove([material.storage_path]);
  if (storageError) throw new Error(storageError.message);

  const { error } = await supabase
    .from('course_materials')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);
  if (error) throw new Error(error.message);
  revalidatePath('/dashboard');
}
