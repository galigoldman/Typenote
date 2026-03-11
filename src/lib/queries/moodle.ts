import { createClient } from '@/lib/supabase/server';

export async function getMoodleInstance(domain: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('moodle_instances')
    .select('*')
    .eq('domain', domain)
    .single();
  if (error && error.code !== 'PGRST116') throw new Error(error.message);
  return data;
}

export async function getMoodleCourse(
  instanceId: string,
  moodleCourseId: string,
) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('moodle_courses')
    .select('*')
    .eq('instance_id', instanceId)
    .eq('moodle_course_id', moodleCourseId)
    .single();
  if (error && error.code !== 'PGRST116') throw new Error(error.message);
  return data;
}

export async function getMoodleSections(courseId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('moodle_sections')
    .select('*')
    .eq('course_id', courseId)
    .order('position');
  if (error) throw new Error(error.message);
  return data;
}

export async function getMoodleFiles(sectionId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('moodle_files')
    .select('*')
    .eq('section_id', sectionId)
    .order('position');
  if (error) throw new Error(error.message);
  return data;
}

export async function getUserMoodleConnection(userId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('user_moodle_connections')
    .select('*, moodle_instances(*)')
    .eq('user_id', userId)
    .single();
  if (error && error.code !== 'PGRST116') throw new Error(error.message);
  return data;
}

export async function getUserCourseSyncs(userId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('user_course_syncs')
    .select('*, moodle_courses(*)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data;
}

export async function getUserFileImports(syncId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('user_file_imports')
    .select('*, moodle_files(*)')
    .eq('sync_id', syncId);
  if (error) throw new Error(error.message);
  return data;
}

export async function getUserImportedFileIds(
  userId: string,
  moodleCourseId: string,
) {
  const supabase = await createClient();

  // Get the user's sync for this course
  const { data: sync } = await supabase
    .from('user_course_syncs')
    .select('id')
    .eq('user_id', userId)
    .eq('moodle_course_id', moodleCourseId)
    .single();

  if (!sync) return { importedFileIds: [], removedFileIds: [] };

  const { data: imports, error } = await supabase
    .from('user_file_imports')
    .select('moodle_file_id, status')
    .eq('sync_id', sync.id);

  if (error) throw new Error(error.message);

  const importedFileIds = (imports ?? [])
    .filter((i) => i.status === 'imported')
    .map((i) => i.moodle_file_id);
  const removedFileIds = (imports ?? [])
    .filter((i) => i.status === 'removed_from_moodle')
    .map((i) => i.moodle_file_id);

  return { importedFileIds, removedFileIds };
}
