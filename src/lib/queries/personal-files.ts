import { createClient } from '@/lib/supabase/server';

export async function getPersonalFilesByCourse(courseId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from('personal_files').select('*')
    .eq('course_id', courseId)
    .order('created_at', { ascending: true });
  return data ?? [];
}
