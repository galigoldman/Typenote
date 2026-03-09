'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

export async function createCourse(data: {
  name: string;
  color: string;
  folder_id: string | null;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data: course, error } = await supabase
    .from('courses')
    .insert({
      user_id: user.id,
      name: data.name,
      color: data.color,
      folder_id: data.folder_id,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  revalidatePath('/dashboard');
  return course;
}

export async function updateCourse(
  id: string,
  data: {
    name?: string;
    color?: string;
  },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data: course, error } = await supabase
    .from('courses')
    .update({
      name: data.name,
      color: data.color,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  revalidatePath('/dashboard');
  return course;
}

export async function deleteCourse(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // Step a: Get all weeks for this course
  const { data: weeks, error: weeksError } = await supabase
    .from('course_weeks')
    .select('id')
    .eq('course_id', id)
    .eq('user_id', user.id);
  if (weeksError) throw new Error(weeksError.message);

  // Step b: Get all materials for those weeks
  if (weeks && weeks.length > 0) {
    const weekIds = weeks.map((w) => w.id);
    const { data: materials, error: materialsError } = await supabase
      .from('course_materials')
      .select('storage_path')
      .in('week_id', weekIds)
      .eq('user_id', user.id);
    if (materialsError) throw new Error(materialsError.message);

    // Step c: Remove files from storage
    if (materials && materials.length > 0) {
      const paths = materials.map((m) => m.storage_path);
      const { error: storageError } = await supabase.storage
        .from('course-materials')
        .remove(paths);
      if (storageError) throw new Error(storageError.message);
    }
  }

  // Step d: Delete course record (DB cascade handles weeks and materials)
  const { error } = await supabase
    .from('courses')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);
  if (error) throw new Error(error.message);

  // Step e: Revalidate
  revalidatePath('/dashboard');
}

export async function moveCourse(id: string, folder_id: string | null) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('courses')
    .update({
      folder_id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('user_id', user.id);
  if (error) throw new Error(error.message);
  revalidatePath('/dashboard');
}
