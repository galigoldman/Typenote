'use server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export type MoodleSectionDto = {
  id: string; title: string;
  files: Array<{ id: string; file_name: string; type: string; mime_type: string | null; file_size: number | null; href: string; isStored: boolean }>;
};

export async function getMoodleMaterialsForCourse(courseId: string): Promise<MoodleSectionDto[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const admin = createAdminClient();
  const { data: sync } = await admin.from('user_course_syncs').select('moodle_course_id').eq('user_id', user.id).eq('course_id', courseId).maybeSingle();
  if (!sync?.moodle_course_id) return [];
  const { data: sections } = await admin.from('moodle_sections')
    .select('id, title, position, moodle_files(id, file_name, type, moodle_url, storage_path, mime_type, file_size, position)')
    .eq('course_id', sync.moodle_course_id).order('position');
  type FileRow = { id: string; file_name: string; type: string; moodle_url: string; storage_path: string | null; mime_type: string | null; file_size: number | null; position: number };
  type Sec = { id: string; title: string; position: number; moodle_files: FileRow[] };
  const allFileIds = (sections ?? []).flatMap((s) => (s as Sec).moodle_files).filter((f) => f.storage_path).map((f) => f.id);
  let importedIds = new Set<string>();
  if (allFileIds.length > 0) {
    const { data: imports } = await admin.from('user_file_imports').select('moodle_file_id').eq('user_id', user.id).eq('status', 'imported').in('moodle_file_id', allFileIds);
    importedIds = new Set((imports ?? []).map((i: { moodle_file_id: string }) => i.moodle_file_id));
  }
  const visible = ((sections ?? []) as Sec[])
    .map((s) => ({ ...s, moodle_files: s.moodle_files.filter((f) => f.storage_path && importedIds.has(f.id)) }))
    .filter((s) => s.moodle_files.length > 0);
  const signed = new Map<string, string>();
  await Promise.all(visible.flatMap((s) => s.moodle_files).map(async (f) => {
    if (!f.storage_path) return;
    const { data } = await admin.storage.from('moodle-materials').createSignedUrl(f.storage_path, 3600);
    if (data?.signedUrl) signed.set(f.id, data.signedUrl);
  }));
  return visible.map((s) => ({
    id: s.id, title: s.title,
    files: s.moodle_files.sort((a, b) => a.position - b.position).map((f) => ({
      id: f.id, file_name: f.file_name, type: f.type, mime_type: f.mime_type,
      file_size: f.file_size, href: signed.get(f.id) ?? f.moodle_url, isStored: signed.has(f.id),
    })),
  }));
}
