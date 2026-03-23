import { createClient } from '@/lib/supabase/server';

export async function getPersonalFilesByCourse(courseId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('personal_files')
    .select('*')
    .eq('course_id', courseId)
    .is('week_id', null)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return data;
}

export async function getPersonalFilesByWeeks(weekIds: string[]) {
  if (weekIds.length === 0) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('personal_files')
    .select('*')
    .in('week_id', weekIds)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return data;
}

export async function getPersonalFilesByWeek(weekId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('personal_files')
    .select('*')
    .eq('week_id', weekId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return data;
}
