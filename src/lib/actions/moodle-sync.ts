'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function saveMoodleConnection(domain: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const admin = createAdminClient();

  // Upsert instance (shared table, needs admin)
  const { data: instance, error: instanceError } = await admin
    .from('moodle_instances')
    .upsert({ domain }, { onConflict: 'domain' })
    .select()
    .single();
  if (instanceError) throw new Error(instanceError.message);

  // Create user connection (per-user table, user client is fine)
  const { error: connectionError } = await supabase
    .from('user_moodle_connections')
    .upsert(
      { user_id: user.id, instance_id: instance.id },
      { onConflict: 'user_id,instance_id' },
    );
  if (connectionError) throw new Error(connectionError.message);

  revalidatePath('/dashboard');
  return { instanceId: instance.id, domain };
}

export async function removeMoodleConnection() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('user_moodle_connections')
    .delete()
    .eq('user_id', user.id);
  if (error) throw new Error(error.message);

  revalidatePath('/dashboard');
}

/**
 * Get the set of Moodle file URLs the CURRENT user has already imported
 * for a course. Used to mark already-synced items in the content picker.
 *
 * The shared registry holds every file anyone has ever synced, but each
 * user only "owns" files they themselves chose to import (tracked in
 * user_file_imports). The picker must reflect the current user's state —
 * never another user's — otherwise items appear locked when they're not.
 */
export async function getExistingFileUrls(
  registryId: string,
): Promise<string[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const admin = createAdminClient();

  const { data: sections } = await admin
    .from('moodle_sections')
    .select('id')
    .eq('course_id', registryId);
  if (!sections || sections.length === 0) return [];

  const sectionIds = sections.map((s: { id: string }) => s.id);

  const { data: files } = await admin
    .from('moodle_files')
    .select('id, moodle_url')
    .in('section_id', sectionIds);
  if (!files || files.length === 0) return [];

  const urlByFileId = new Map<string, string>(
    files.map((f: { id: string; moodle_url: string }) => [f.id, f.moodle_url]),
  );

  const { data: imports } = await admin
    .from('user_file_imports')
    .select('moodle_file_id')
    .eq('user_id', user.id)
    .eq('status', 'imported')
    .in('moodle_file_id', Array.from(urlByFileId.keys()));

  return (imports ?? [])
    .map((i: { moodle_file_id: string }) => urlByFileId.get(i.moodle_file_id))
    .filter((u): u is string => !!u);
}

/**
 * Record that the current user has imported a specific Moodle file.
 * Called from the upload routes after a successful storage write so the
 * picker can show "synced" only for files THIS user actually imported.
 *
 * If no user_course_syncs row exists (e.g., the file was uploaded outside
 * the normal sync flow), this is a no-op — user_file_imports.sync_id is
 * NOT NULL, so we can't synthesize a parent here.
 */
export async function recordUserFileImport(
  userId: string,
  moodleFileId: string,
  moodleCourseDbId: string,
): Promise<void> {
  const admin = createAdminClient();

  const { data: sync } = await admin
    .from('user_course_syncs')
    .select('id')
    .eq('user_id', userId)
    .eq('moodle_course_id', moodleCourseDbId)
    .single();
  if (!sync?.id) return;

  await admin.from('user_file_imports').upsert(
    {
      user_id: userId,
      moodle_file_id: moodleFileId,
      sync_id: sync.id,
      status: 'imported' as const,
    },
    { onConflict: 'user_id,moodle_file_id' },
  );
}

/**
 * Compare scraped Moodle courses against the shared registry.
 * Called from client to determine each course's sync status.
 */
export async function compareScrapedCourses(
  instanceDomain: string,
  scrapedCourses: Array<{ moodleCourseId: string; name: string; url: string }>,
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { compareCourses } = await import('@/lib/moodle/sync-service');
  return compareCourses(instanceDomain, scrapedCourses, user.id);
}

/**
 * Sync selected Moodle courses to the shared registry and
 * create/update user_course_syncs records for the current user.
 */
export async function syncMoodleCourses(
  instanceDomain: string,
  courses: Array<{
    moodleCourseId: string;
    name: string;
    moodleUrl: string;
    sections: Array<{
      moodleSectionId: string;
      title: string;
      position: number;
      items: Array<{
        type: 'file' | 'link';
        name: string;
        moodleUrl: string;
        externalUrl?: string;
        fileSize?: number;
        mimeType?: string;
      }>;
    }>;
  }>,
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { upsertMoodleData } = await import('@/lib/moodle/sync-service');
  const admin = createAdminClient();

  // Step 1: Upsert course data into shared registry
  const syncResult = await upsertMoodleData({
    instanceDomain,
    courses,
  });

  // Step 2: Create Typenote courses and user_course_syncs for courses with actual content
  const courseName = (idx: number) => courses[idx]?.name ?? 'Untitled Course';
  for (let i = 0; i < syncResult.courses.length; i++) {
    const courseResult = syncResult.courses[i];
    const hasFiles = courseResult.sections.some((s) => s.items.length > 0);
    if (!hasFiles) continue;

    // Check if a user_course_syncs record already exists with a linked Typenote course
    const { data: existingSync } = await admin
      .from('user_course_syncs')
      .select('id, course_id')
      .eq('user_id', user.id)
      .eq('moodle_course_id', courseResult.id)
      .single();

    let courseId = existingSync?.course_id ?? null;

    // If no linked Typenote course yet, create one
    if (!courseId) {
      const { data: newCourse, error: courseCreateError } = await supabase
        .from('courses')
        .insert({
          user_id: user.id,
          name: courseName(i),
          color: '#3B82F6',
        })
        .select()
        .single();
      if (courseCreateError) {
        throw new Error(
          `Failed to create course: ${courseCreateError.message}`,
        );
      }
      courseId = newCourse.id;
    }

    const { error } = await admin.from('user_course_syncs').upsert(
      {
        user_id: user.id,
        moodle_course_id: courseResult.id,
        course_id: courseId,
        last_synced_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,moodle_course_id' },
    );
    if (error) {
      throw new Error(`Failed to create sync record: ${error.message}`);
    }
  }

  revalidatePath('/', 'layout');

  return {
    syncedCount: syncResult.courses.length,
    courses: syncResult.courses,
  };
}

/**
 * Record file imports for a Moodle course.
 *
 * Called after the client-side extension has downloaded and uploaded files.
 * This server action creates the user_course_syncs + user_file_imports records.
 *
 * @param moodleCourseId - Our moodle_courses UUID (registry ID)
 * @param fileIds - Array of moodle_files UUIDs to mark as imported
 * @param courseId - Optional Typenote course to link to
 * @returns The sync record ID and count of files imported
 */
export async function recordFileImports(
  moodleCourseId: string,
  fileIds: string[],
  courseId?: string,
): Promise<{ syncId: string; importedCount: number }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const admin = createAdminClient();

  // Upsert user_course_syncs record
  const { data: sync, error: syncError } = await admin
    .from('user_course_syncs')
    .upsert(
      {
        user_id: user.id,
        moodle_course_id: moodleCourseId,
        course_id: courseId ?? null,
        last_synced_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,moodle_course_id' },
    )
    .select()
    .single();

  if (syncError) throw new Error(`Sync record failed: ${syncError.message}`);

  // Insert user_file_imports for each file ID
  if (fileIds.length > 0) {
    const imports = fileIds.map((fileId) => ({
      user_id: user.id,
      moodle_file_id: fileId,
      sync_id: sync.id,
      status: 'imported' as const,
    }));

    const { error: importError } = await admin
      .from('user_file_imports')
      .upsert(imports, { onConflict: 'user_id,moodle_file_id' });

    if (importError) {
      throw new Error(`Import record failed: ${importError.message}`);
    }
  }

  revalidatePath('/dashboard');

  return {
    syncId: sync.id,
    importedCount: fileIds.length,
  };
}

/**
 * Remove a Moodle file from the current user's notebook.
 * Hard-deletes the user_file_imports row. The file remains in the
 * shared registry and embeddings (other users may still reference it).
 */
export async function removeMoodleFileFromNotebook(
  moodleFileId: string,
  courseId: string,
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  // RLS already restricts user_file_imports.delete to auth.uid() =
  // user_id; the explicit .eq is belt-and-suspenders.
  const { error } = await supabase
    .from('user_file_imports')
    .delete()
    .eq('moodle_file_id', moodleFileId)
    .eq('user_id', user.id);

  if (error) throw new Error(error.message);

  // Codebase convention: literal-path revalidation (see
  // src/lib/actions/documents.ts:152).
  revalidatePath('/dashboard/courses/' + courseId);
}
