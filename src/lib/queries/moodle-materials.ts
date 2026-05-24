import { createAdminClient } from '@/lib/supabase/admin';

export type ImportableMoodleFile = {
  id: string;
  file_name: string;
  storage_path: string;
  mime_type: string | null;
  file_size: number | null;
  sectionTitle: string;
};

/**
 * Lightweight metadata-only list of Moodle files the current user has
 * imported, flattened across sections. Used by the week import picker.
 * Does NOT generate signed URLs.
 */
export async function getMoodleImportableFiles(
  courseId: string,
  userId: string,
): Promise<ImportableMoodleFile[]> {
  const admin = createAdminClient();

  const { data: syncRecord } = await admin
    .from('user_course_syncs')
    .select('moodle_course_id')
    .eq('user_id', userId)
    .eq('course_id', courseId)
    .maybeSingle();

  if (!syncRecord) return [];

  const { data: sections } = await admin
    .from('moodle_sections')
    .select(
      'title, moodle_files(id, file_name, type, storage_path, mime_type, file_size)',
    )
    .eq('course_id', syncRecord.moodle_course_id)
    .order('position');

  if (!sections || sections.length === 0) return [];

  type RawFile = {
    id: string;
    file_name: string;
    type: string;
    storage_path: string | null;
    mime_type: string | null;
    file_size: number | null;
  };
  type RawSection = { title: string; moodle_files: RawFile[] };

  const allFiles = (sections as RawSection[]).flatMap((s) =>
    s.moodle_files
      .filter((f) => f.storage_path && f.type === 'file')
      .map((f) => ({ ...f, sectionTitle: s.title })),
  );

  if (allFiles.length === 0) return [];

  const { data: imports } = await admin
    .from('user_file_imports')
    .select('moodle_file_id')
    .eq('user_id', userId)
    .eq('status', 'imported')
    .in(
      'moodle_file_id',
      allFiles.map((f) => f.id),
    );

  const importedIds = new Set(
    (imports ?? []).map((i: { moodle_file_id: string }) => i.moodle_file_id),
  );

  return allFiles
    .filter((f) => importedIds.has(f.id))
    .map((f) => ({
      id: f.id,
      file_name: f.file_name,
      storage_path: f.storage_path as string,
      mime_type: f.mime_type,
      file_size: f.file_size,
      sectionTitle: f.sectionTitle,
    }));
}
