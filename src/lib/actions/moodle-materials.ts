'use server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export type MoodleSectionDto = {
  id: string;
  title: string;
  files: Array<{
    id: string;
    file_name: string;
    type: string;
    mime_type: string | null;
    file_size: number | null;
    href: string;
    isStored: boolean;
  }>;
};

export async function getMoodleMaterialsForCourse(
  courseId: string,
): Promise<MoodleSectionDto[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const admin = createAdminClient();

  // Use course_moodle_view RPC so members see the OWNER's Moodle imports.
  // The RPC enforces is_course_member() internally and returns nulls if the
  // caller is not a member (or there is no owner sync).
  const { data: viewRows } = await supabase.rpc('course_moodle_view', {
    p_course_id: courseId,
  });
  const view = Array.isArray(viewRows) ? viewRows[0] : viewRows;
  const moodleCourseId: string | null = view?.moodle_course_id ?? null;
  const importedIds: string[] = view?.imported_file_ids ?? [];
  if (!moodleCourseId || importedIds.length === 0) return [];

  const importedSet = new Set<string>(importedIds);

  const { data: sections } = await admin
    .from('moodle_sections')
    .select(
      'id, title, position, moodle_files(id, file_name, type, moodle_url, storage_path, mime_type, file_size, position)',
    )
    .eq('course_id', moodleCourseId)
    .order('position');
  type FileRow = {
    id: string;
    file_name: string;
    type: string;
    moodle_url: string;
    storage_path: string | null;
    mime_type: string | null;
    file_size: number | null;
    position: number;
  };
  type Sec = {
    id: string;
    title: string;
    position: number;
    moodle_files: FileRow[];
  };

  // Show the owner's imported files that have been downloaded to storage.
  // This preserves the original display behavior (only stored files appear);
  // the ONLY change from before is the SOURCE of the imported set — now the
  // course owner's imports (via course_moodle_view) instead of the caller's.
  const visible = ((sections ?? []) as Sec[])
    .map((s) => ({
      ...s,
      moodle_files: s.moodle_files.filter(
        (f) => f.storage_path && importedSet.has(f.id),
      ),
    }))
    .filter((s) => s.moodle_files.length > 0);

  const signed = new Map<string, string>();
  await Promise.all(
    visible
      .flatMap((s) => s.moodle_files)
      .map(async (f) => {
        if (!f.storage_path) return;
        const { data } = await admin.storage
          .from('moodle-materials')
          .createSignedUrl(f.storage_path, 3600);
        if (data?.signedUrl) signed.set(f.id, data.signedUrl);
      }),
  );
  return visible.map((s) => ({
    id: s.id,
    title: s.title,
    files: s.moodle_files
      .sort((a, b) => a.position - b.position)
      .map((f) => ({
        id: f.id,
        file_name: f.file_name,
        type: f.type,
        mime_type: f.mime_type,
        file_size: f.file_size,
        href: signed.get(f.id) ?? f.moodle_url,
        isStored: signed.has(f.id),
      })),
  }));
}
