'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

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

/**
 * Import a Moodle file into a course week as a course_material.
 * References the existing file in moodle-materials bucket — no copy needed.
 */
export async function importMoodleFile(data: {
  moodleFileId: string;
  weekId: string;
  courseId: string;
  category: 'material' | 'homework';
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const admin = createAdminClient();

  // Fetch the Moodle file record
  const { data: moodleFile, error: fetchError } = await admin
    .from('moodle_files')
    .select('id, file_name, storage_path, file_size, mime_type')
    .eq('id', data.moodleFileId)
    .single();

  if (fetchError || !moodleFile) throw new Error('Moodle file not found');
  if (!moodleFile.storage_path)
    throw new Error('File not downloaded yet — sync first');

  // Check if already imported to this week
  const { data: existing } = await supabase
    .from('course_materials')
    .select('id')
    .eq('week_id', data.weekId)
    .eq('file_name', moodleFile.file_name)
    .single();

  if (existing) throw new Error('This file is already imported to this week');

  // Create course_material record pointing to the moodle-materials storage
  // Use a prefixed path so we know it's a moodle reference
  const storagePath = `moodle:${moodleFile.storage_path}`;

  const { data: material, error: insertError } = await supabase
    .from('course_materials')
    .insert({
      user_id: user.id,
      week_id: data.weekId,
      category: data.category,
      storage_path: storagePath,
      file_name: moodleFile.file_name,
      file_size: moodleFile.file_size ?? 0,
      mime_type: moodleFile.mime_type ?? 'application/octet-stream',
    })
    .select()
    .single();

  if (insertError) throw new Error(insertError.message);

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
