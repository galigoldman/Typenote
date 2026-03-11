import { createAdminClient } from '@/lib/supabase/admin';
import { checkFileExists } from './dedup';
import type {
  SyncRequestPayload,
  SyncResponsePayload,
  SyncCourseResult,
  SyncSectionResult,
  SyncFileResult,
} from './types';

// ============================================
// Course comparison types & logic (T036)
// ============================================

export type CourseComparisonStatus =
  | 'new_to_system'
  | 'synced_by_others'
  | 'synced_by_user'
  | 'has_new_items';

export interface CourseComparison {
  moodleCourseId: string;
  name: string;
  moodleUrl: string;
  status: CourseComparisonStatus;
  registryId?: string;
  lastSyncedAt?: string;
}

/**
 * Compare scraped Moodle courses against the shared registry
 * to determine each course's status for the current user.
 *
 * Logic per course:
 * 1. Look up instance by domain
 * 2. Check if course exists in `moodle_courses`
 * 3. If exists, check if this user has a `user_course_syncs` record
 * 4. Return appropriate status
 */
export async function compareCourses(
  instanceDomain: string,
  scrapedCourses: Array<{ moodleCourseId: string; name: string; url: string }>,
  userId: string,
): Promise<CourseComparison[]> {
  const admin = createAdminClient();

  // Step 1: Look up instance by domain
  const { data: instance } = await admin
    .from('moodle_instances')
    .select('id')
    .eq('domain', instanceDomain)
    .single();

  // If instance doesn't exist, all courses are new
  if (!instance) {
    return scrapedCourses.map((course) => ({
      moodleCourseId: course.moodleCourseId,
      name: course.name,
      moodleUrl: course.url,
      status: 'new_to_system' as const,
    }));
  }

  const results: CourseComparison[] = [];

  for (const scraped of scrapedCourses) {
    // Step 2: Check if course exists in the shared registry
    const { data: registryCourse } = await admin
      .from('moodle_courses')
      .select('id')
      .eq('instance_id', instance.id)
      .eq('moodle_course_id', scraped.moodleCourseId)
      .single();

    if (!registryCourse) {
      results.push({
        moodleCourseId: scraped.moodleCourseId,
        name: scraped.name,
        moodleUrl: scraped.url,
        status: 'new_to_system',
      });
      continue;
    }

    // Step 3: Check if this user has a sync record
    const { data: userSync } = await admin
      .from('user_course_syncs')
      .select('id, last_synced_at')
      .eq('user_id', userId)
      .eq('moodle_course_id', registryCourse.id)
      .single();

    if (!userSync) {
      results.push({
        moodleCourseId: scraped.moodleCourseId,
        name: scraped.name,
        moodleUrl: scraped.url,
        status: 'synced_by_others',
        registryId: registryCourse.id,
      });
    } else {
      results.push({
        moodleCourseId: scraped.moodleCourseId,
        name: scraped.name,
        moodleUrl: scraped.url,
        status: 'synced_by_user',
        registryId: registryCourse.id,
        lastSyncedAt: userSync.last_synced_at,
      });
    }
  }

  return results;
}

/**
 * Upsert scraped Moodle data into the shared registry.
 * Returns the status of each item (exists/new/modified).
 */
export async function upsertMoodleData(
  payload: SyncRequestPayload,
): Promise<SyncResponsePayload> {
  const admin = createAdminClient();

  // Upsert instance
  const { data: instance, error: instanceError } = await admin
    .from('moodle_instances')
    .upsert({ domain: payload.instanceDomain }, { onConflict: 'domain' })
    .select()
    .single();
  if (instanceError)
    throw new Error(`Instance upsert failed: ${instanceError.message}`);

  const courseResults: SyncCourseResult[] = [];

  for (const course of payload.courses) {
    // Upsert course
    const { data: dbCourse, error: courseError } = await admin
      .from('moodle_courses')
      .upsert(
        {
          instance_id: instance.id,
          moodle_course_id: course.moodleCourseId,
          name: course.name,
          moodle_url: course.moodleUrl,
        },
        { onConflict: 'instance_id,moodle_course_id' },
      )
      .select()
      .single();
    if (courseError)
      throw new Error(`Course upsert failed: ${courseError.message}`);

    const sectionResults: SyncSectionResult[] = [];

    for (const section of course.sections) {
      // Upsert section
      const { data: dbSection, error: sectionError } = await admin
        .from('moodle_sections')
        .upsert(
          {
            course_id: dbCourse.id,
            moodle_section_id: section.moodleSectionId,
            title: section.title,
            position: section.position,
          },
          { onConflict: 'course_id,moodle_section_id' },
        )
        .select()
        .single();
      if (sectionError)
        throw new Error(`Section upsert failed: ${sectionError.message}`);

      const fileResults: SyncFileResult[] = [];

      for (const item of section.items) {
        // Check dedup status
        const dedupResult = await checkFileExists(
          admin,
          dbSection.id,
          item.moodleUrl,
          null,
        );

        if (dedupResult.status === 'new') {
          // Insert new file record (without storage_path/content_hash — those come during upload)
          const { data: dbFile, error: fileError } = await admin
            .from('moodle_files')
            .insert({
              section_id: dbSection.id,
              type: item.type,
              moodle_url: item.moodleUrl,
              file_name: item.name,
              external_url: item.externalUrl ?? null,
              file_size: item.fileSize ?? null,
              mime_type: item.mimeType ?? null,
              position: section.items.indexOf(item),
            })
            .select()
            .single();
          if (fileError)
            throw new Error(`File insert failed: ${fileError.message}`);

          fileResults.push({
            moodleUrl: item.moodleUrl,
            id: dbFile.id,
            status: 'new',
          });
        } else {
          fileResults.push({
            moodleUrl: item.moodleUrl,
            id: dedupResult.fileId!,
            status: dedupResult.status,
          });
        }
      }

      sectionResults.push({
        moodleSectionId: section.moodleSectionId,
        id: dbSection.id,
        items: fileResults,
      });
    }

    courseResults.push({
      moodleCourseId: course.moodleCourseId,
      id: dbCourse.id,
      sections: sectionResults,
    });
  }

  return { courses: courseResults };
}
