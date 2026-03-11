'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function saveMoodleConnection(domain: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
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
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('user_moodle_connections')
    .delete()
    .eq('user_id', user.id);
  if (error) throw new Error(error.message);

  revalidatePath('/dashboard');
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
  const { data: { user } } = await supabase.auth.getUser();
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
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { upsertMoodleData } = await import('@/lib/moodle/sync-service');
  const admin = createAdminClient();

  // Step 1: Upsert course data into shared registry
  const syncResult = await upsertMoodleData({
    instanceDomain,
    courses,
  });

  // Step 2: Create/update user_course_syncs records
  for (const courseResult of syncResult.courses) {
    const { error } = await admin
      .from('user_course_syncs')
      .upsert(
        {
          user_id: user.id,
          moodle_course_id: courseResult.id,
          last_synced_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,moodle_course_id' },
      );
    if (error) {
      throw new Error(`Failed to create sync record: ${error.message}`);
    }
  }

  revalidatePath('/dashboard');

  return {
    syncedCount: syncResult.courses.length,
    courses: syncResult.courses,
  };
}
