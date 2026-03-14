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
 * Get the set of Moodle file URLs already in the registry for a course.
 * Used to mark already-synced items in the content picker.
 */
export async function getExistingFileUrls(
  registryId: string,
): Promise<string[]> {
  const admin = createAdminClient();

  const { data: sections } = await admin
    .from('moodle_sections')
    .select('id')
    .eq('course_id', registryId);

  if (!sections || sections.length === 0) return [];

  const { data: files } = await admin
    .from('moodle_files')
    .select('moodle_url')
    .in(
      'section_id',
      sections.map((s: { id: string }) => s.id),
    );

  return (files ?? []).map((f: { moodle_url: string }) => f.moodle_url);
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
