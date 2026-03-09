'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

export async function createCourseWeek(data: {
  course_id: string;
  topic?: string;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data: maxWeek } = await supabase
    .from('course_weeks')
    .select('week_number')
    .eq('course_id', data.course_id)
    .order('week_number', { ascending: false })
    .limit(1)
    .single();

  const weekNumber = maxWeek ? maxWeek.week_number + 1 : 1;

  const { data: week, error } = await supabase
    .from('course_weeks')
    .insert({
      user_id: user.id,
      course_id: data.course_id,
      week_number: weekNumber,
      topic: data.topic,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  revalidatePath('/dashboard');
  return week;
}

export async function updateCourseWeek(
  id: string,
  data: {
    topic?: string;
    week_number?: number;
  },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data: week, error } = await supabase
    .from('course_weeks')
    .update({
      ...data,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  revalidatePath('/dashboard');
  return week;
}

export async function deleteCourseWeek(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data: materials } = await supabase
    .from('course_materials')
    .select('storage_path')
    .eq('week_id', id);

  const storagePaths = (materials ?? [])
    .map((m) => m.storage_path)
    .filter(Boolean) as string[];

  if (storagePaths.length > 0) {
    await supabase.storage.from('course-materials').remove(storagePaths);
  }

  const { error } = await supabase
    .from('course_weeks')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);
  if (error) throw new Error(error.message);
  revalidatePath('/dashboard');
}
