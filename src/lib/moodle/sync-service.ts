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

    // Step 3: Check if the course actually has content (sections with files)
    const { count: fileCount } = await admin
      .from('moodle_sections')
      .select('id, moodle_files(id)', { count: 'exact', head: false })
      .eq('course_id', registryCourse.id);

    // Count actual files across all sections
    const { count: totalFiles } = await admin
      .from('moodle_files')
      .select('id', { count: 'exact', head: true })
      .in(
        'section_id',
        (await admin
          .from('moodle_sections')
          .select('id')
          .eq('course_id', registryCourse.id)
        ).data?.map((s: { id: string }) => s.id) ?? [],
      );

    const hasContent = (totalFiles ?? 0) > 0;

    // Step 4: Check if this user has a sync record
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
        status: hasContent ? 'synced_by_others' : 'new_to_system',
        registryId: registryCourse.id,
      });
    } else if (!hasContent) {
      // User has a sync record but no actual content — treat as new
      results.push({
        moodleCourseId: scraped.moodleCourseId,
        name: scraped.name,
        moodleUrl: scraped.url,
        status: 'new_to_system',
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

// ============================================
// Change detection types & logic (T051)
// ============================================

export interface ChangeDetectionResult {
  newFiles: Array<{
    sectionId: string;
    moodleUrl: string;
    name: string;
    type: 'file' | 'link';
  }>;
  removedFiles: Array<{
    fileId: string;
    fileName: string;
  }>;
  modifiedFiles: Array<{
    fileId: string;
    fileName: string;
    moodleUrl: string;
  }>;
  unchangedCount: number;
}

/**
 * Compare scraped Moodle section data against the shared registry
 * to detect new, removed, modified, and unchanged files.
 *
 * Logic:
 * 1. Fetch all existing sections and files for this course
 * 2. Build a map of existing files by moodle_url per section
 * 3. Compare against scraped data to classify each item
 */
export async function detectChanges(
  courseId: string,
  scrapedSections: Array<{
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
  }>,
): Promise<ChangeDetectionResult> {
  const admin = createAdminClient();

  // Step 1: Fetch all sections for this course
  const { data: dbSections } = await admin
    .from('moodle_sections')
    .select('id, moodle_section_id')
    .eq('course_id', courseId)
    .order('position');

  const sections = dbSections ?? [];

  // Step 2: For each DB section, fetch its files and build a lookup map
  // Map: moodleSectionId -> Map<moodleUrl, fileRecord>
  type FileRecord = {
    id: string;
    moodle_url: string;
    file_name: string;
    file_size: number | null;
    is_removed: boolean;
  };
  const registryMap = new Map<string, Map<string, FileRecord>>();

  for (const section of sections) {
    const { data: files } = await admin
      .from('moodle_files')
      .select('id, moodle_url, file_name, file_size, is_removed')
      .eq('section_id', section.id)
      .order('position');

    const fileMap = new Map<string, FileRecord>();
    for (const file of (files ?? []) as FileRecord[]) {
      fileMap.set(file.moodle_url, file);
    }
    registryMap.set(section.moodle_section_id, fileMap);
  }

  // Step 3: Compare scraped data against registry
  const result: ChangeDetectionResult = {
    newFiles: [],
    removedFiles: [],
    modifiedFiles: [],
    unchangedCount: 0,
  };

  // Track all URLs seen in scraped data (per section) to detect removals
  const scrapedUrlsBySection = new Map<string, Set<string>>();

  for (const scrapedSection of scrapedSections) {
    const urlSet = new Set<string>();
    scrapedUrlsBySection.set(scrapedSection.moodleSectionId, urlSet);

    const registryFiles = registryMap.get(scrapedSection.moodleSectionId);

    for (const item of scrapedSection.items) {
      urlSet.add(item.moodleUrl);

      if (!registryFiles || !registryFiles.has(item.moodleUrl)) {
        // New file: not in registry
        result.newFiles.push({
          sectionId: scrapedSection.moodleSectionId,
          moodleUrl: item.moodleUrl,
          name: item.name,
          type: item.type,
        });
      } else {
        const existing = registryFiles.get(item.moodleUrl)!;
        // Check if modified: name or fileSize changed
        const nameChanged = item.name !== existing.file_name;
        const sizeChanged =
          item.fileSize !== undefined &&
          existing.file_size !== null &&
          item.fileSize !== existing.file_size;

        if (nameChanged || sizeChanged) {
          result.modifiedFiles.push({
            fileId: existing.id,
            fileName: item.name,
            moodleUrl: item.moodleUrl,
          });
        } else {
          result.unchangedCount++;
        }
      }
    }
  }

  // Detect removed files: registry files not present in any scraped section
  for (const [sectionId, fileMap] of registryMap) {
    const scrapedUrls = scrapedUrlsBySection.get(sectionId) ?? new Set();
    for (const [url, file] of fileMap) {
      // Skip files already flagged as removed
      if (file.is_removed) continue;
      if (!scrapedUrls.has(url)) {
        result.removedFiles.push({
          fileId: file.id,
          fileName: file.file_name,
        });
      }
    }
  }

  return result;
}

// ============================================
// Removed file flagging (T052)
// ============================================

/**
 * Flag files as removed from Moodle.
 * Updates moodle_files.is_removed = true and
 * user_file_imports.status = 'removed_from_moodle' for affected files.
 */
export async function flagRemovedFiles(fileIds: string[]): Promise<void> {
  if (fileIds.length === 0) return;

  const admin = createAdminClient();

  // Mark files as removed in the shared registry
  await admin
    .from('moodle_files')
    .update({ is_removed: true })
    .in('id', fileIds);

  // Update user import status for all users who imported these files
  await admin
    .from('user_file_imports')
    .update({ status: 'removed_from_moodle' })
    .in('moodle_file_id', fileIds);
}

// ============================================
// Modified file replacement (T053)
// ============================================

/**
 * Update a modified file's metadata in the registry.
 * If a new storage path is provided and an old one exists,
 * deletes the old file from Supabase Storage.
 */
export async function updateModifiedFile(
  fileId: string,
  updates: {
    contentHash?: string;
    storagePath?: string;
    fileSize?: number;
    fileName?: string;
  },
): Promise<void> {
  const admin = createAdminClient();

  // Fetch current file to check for old storage_path
  const { data: currentFile } = await admin
    .from('moodle_files')
    .select('id, storage_path')
    .eq('id', fileId)
    .single();

  // Build update payload mapping camelCase to snake_case column names
  const updatePayload: Record<string, unknown> = {};
  if (updates.contentHash !== undefined)
    updatePayload.content_hash = updates.contentHash;
  if (updates.storagePath !== undefined)
    updatePayload.storage_path = updates.storagePath;
  if (updates.fileSize !== undefined)
    updatePayload.file_size = updates.fileSize;
  if (updates.fileName !== undefined)
    updatePayload.file_name = updates.fileName;

  // Update the file record
  await admin.from('moodle_files').update(updatePayload).eq('id', fileId);

  // If there's an old storage_path and a new one, delete the old file
  if (
    updates.storagePath &&
    currentFile?.storage_path &&
    currentFile.storage_path !== updates.storagePath
  ) {
    await admin.storage
      .from('moodle-materials')
      .remove([currentFile.storage_path]);
  }
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
