import { createClient } from '@/lib/supabase/server';

export async function getWeeksByCourse(courseId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('course_weeks')
    .select('*')
    .eq('course_id', courseId)
    .order('week_number');

  if (error) throw new Error(error.message);
  return data;
}

export async function getWeek(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('course_weeks')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw new Error(error.message);
  return data;
}
