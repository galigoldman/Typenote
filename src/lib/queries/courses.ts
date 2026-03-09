import { createClient } from '@/lib/supabase/server';
import type { Course, Folder } from '@/types/database';

export async function getCoursesByFolder(folderId: string | null) {
  const supabase = await createClient();
  const query = supabase.from('courses').select('*').order('position');

  if (folderId) {
    query.eq('folder_id', folderId);
  } else {
    query.is('folder_id', null);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
}

export async function getCourse(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('courses')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function getCourseBreadcrumbs(
  courseId: string,
): Promise<{ id: string; name: string; type: 'course' | 'folder' }[]> {
  const supabase = await createClient();
  const breadcrumbs: { id: string; name: string; type: 'course' | 'folder' }[] =
    [];

  const courseResult = await supabase
    .from('courses')
    .select('*')
    .eq('id', courseId)
    .single();

  if (courseResult.error) throw new Error(courseResult.error.message);

  const course = courseResult.data as Course;
  let currentId: string | null = course.folder_id;

  while (currentId) {
    const result = await supabase
      .from('folders')
      .select('*')
      .eq('id', currentId)
      .single();

    if (result.error) throw new Error(result.error.message);

    const folder = result.data as Folder;
    breadcrumbs.unshift({ id: folder.id, name: folder.name, type: 'folder' });
    currentId = folder.parent_id;
  }

  breadcrumbs.push({ id: course.id, name: course.name, type: 'course' });

  return breadcrumbs;
}
