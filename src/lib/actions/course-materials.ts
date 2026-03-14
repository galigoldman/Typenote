'use server';

import { revalidatePath } from 'next/cache';

import { indexContent } from '@/lib/actions/ai-context';
import { invalidateCache } from '@/lib/ai/context-cache';
import { deleteEmbeddingsBySource } from '@/lib/queries/embeddings';
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

  // Index the uploaded material for AI search (fire-and-forget)
  const { data: week } = await supabase
    .from('course_weeks')
    .select('course_id')
    .eq('id', data.week_id)
    .single();

  if (week && material) {
    indexContent({
      type: 'course_material',
      materialId: material.id,
      courseId: week.course_id,
      weekId: data.week_id,
    }).catch((err) => console.error('Failed to index course material:', err));

    // Invalidate shared context cache for this week (materials changed)
    invalidateCache(week.course_id, data.week_id).catch((err) =>
      console.error('Failed to invalidate cache:', err),
    );
  }

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
    .select('storage_path, week_id')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();
  if (fetchError) throw new Error(fetchError.message);

  const { error: storageError } = await supabase.storage
    .from('course-materials')
    .remove([material.storage_path]);
  if (storageError) throw new Error(storageError.message);

  // Delete AI index entries
  deleteEmbeddingsBySource('course_material', id).catch((err) =>
    console.error('Failed to delete embeddings for course material:', err),
  );

  // Invalidate context cache for this week
  if (material.week_id) {
    const { data: week } = await supabase
      .from('course_weeks')
      .select('course_id')
      .eq('id', material.week_id)
      .single();
    if (week) {
      invalidateCache(week.course_id, material.week_id).catch((err) =>
        console.error('Failed to invalidate cache:', err),
      );
    }
  }

  const { error } = await supabase
    .from('course_materials')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);
  if (error) throw new Error(error.message);
  revalidatePath('/dashboard');
}
