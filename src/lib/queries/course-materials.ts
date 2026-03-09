import { createClient } from '@/lib/supabase/server';

export async function getMaterialsByWeek(weekId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('course_materials')
    .select('*')
    .eq('week_id', weekId)
    .order('created_at');

  if (error) throw new Error(error.message);
  return data;
}

export async function getMaterialsByWeekAndCategory(
  weekId: string,
  category: 'material' | 'homework',
) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('course_materials')
    .select('*')
    .eq('week_id', weekId)
    .eq('category', category)
    .order('created_at');

  if (error) throw new Error(error.message);
  return data;
}
