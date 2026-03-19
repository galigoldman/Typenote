import { createAdminClient } from '@/lib/supabase/admin';

// ============================================
// Assignment upsert types & logic
// ============================================

export interface AttachedFileInfo {
  name: string;
  url: string;
}

export interface UpsertAssignmentParams {
  sectionId: string;
  moodleUrl: string;
  moodleModuleId: string;
  title: string;
  descriptionHtml: string;
  dueDate: string | null;
  attachedFiles?: AttachedFileInfo[];
}

export interface UpsertAssignmentResult {
  assignmentId: string;
  isNew: boolean;
  contentChanged: boolean;
  /** Attached file URLs that need to be downloaded via the extension */
  filesToDownload: AttachedFileInfo[];
}

/**
 * Upsert a Moodle assignment into the shared registry.
 * Identifies existing records by section_id + moodle_url.
 * - If new: inserts a fresh row.
 * - If content changed (description_html differs): increments content_version and updates.
 * - If unchanged: skips the write and returns the existing id.
 */
export async function upsertAssignment(
  params: UpsertAssignmentParams,
): Promise<UpsertAssignmentResult> {
  const admin = createAdminClient();

  const { data: existing } = await admin
    .from('moodle_assignments')
    .select('id, description_html, content_version')
    .eq('section_id', params.sectionId)
    .eq('moodle_url', params.moodleUrl)
    .single();

  if (!existing) {
    const { data: created } = await admin
      .from('moodle_assignments')
      .insert({
        section_id: params.sectionId,
        moodle_url: params.moodleUrl,
        moodle_module_id: params.moodleModuleId,
        title: params.title,
        description_html: params.descriptionHtml,
        due_date: params.dueDate,
        is_removed: false,
      })
      .select('id, content_version')
      .single();

    // Link attached files (they'll be downloaded in a later step)
    const filesToDownload = params.attachedFiles ?? [];
    return { assignmentId: created!.id, isNew: true, contentChanged: false, filesToDownload };
  }

  const contentChanged = existing.description_html !== params.descriptionHtml;

  if (contentChanged) {
    const { data: updated } = await admin
      .from('moodle_assignments')
      .update({
        title: params.title,
        description_html: params.descriptionHtml,
        due_date: params.dueDate,
        content_version: existing.content_version + 1,
        is_removed: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .select('id, content_version')
      .single();

    return { assignmentId: updated!.id, isNew: false, contentChanged: true, filesToDownload: params.attachedFiles ?? [] };
  }

  return { assignmentId: existing.id, isNew: false, contentChanged: false, filesToDownload: [] };
}

/**
 * Link moodle_files to an assignment after they've been downloaded and stored.
 * Finds the moodle_file rows by their moodle_url and creates join records.
 */
export async function linkFilesToAssignment(
  assignmentId: string,
  sectionId: string,
  fileUrls: string[],
): Promise<void> {
  if (fileUrls.length === 0) return;
  const admin = createAdminClient();

  // Find the moodle_file IDs for these URLs
  const { data: files } = await admin
    .from('moodle_files')
    .select('id, moodle_url')
    .eq('section_id', sectionId)
    .in('moodle_url', fileUrls);

  if (!files || files.length === 0) return;

  // Upsert join records (ignore conflicts for idempotency)
  const rows = files.map((f: { id: string }, i: number) => ({
    assignment_id: assignmentId,
    moodle_file_id: f.id,
    position: i,
  }));

  await admin
    .from('moodle_assignment_files')
    .upsert(rows, { onConflict: 'assignment_id,moodle_file_id' });
}

// ============================================
// Removed assignment flagging
// ============================================

/**
 * Soft-delete assignments that are no longer present on Moodle.
 * Compares current moodle_assignments rows (is_removed = false) for the
 * given section against the list of URLs still seen in the latest scrape.
 * Any row whose moodle_url is absent from currentMoodleUrls gets
 * is_removed = true.
 */
export async function flagRemovedAssignments(
  sectionId: string,
  currentMoodleUrls: string[],
): Promise<void> {
  const admin = createAdminClient();

  const { data: existing } = await admin
    .from('moodle_assignments')
    .select('id, moodle_url')
    .eq('section_id', sectionId)
    .eq('is_removed', false);

  if (!existing) return;

  const removedIds = existing
    .filter((a: { id: string; moodle_url: string }) =>
      !currentMoodleUrls.includes(a.moodle_url),
    )
    .map((a: { id: string; moodle_url: string }) => a.id);

  if (removedIds.length === 0) return;

  await admin
    .from('moodle_assignments')
    .update({ is_removed: true, updated_at: new Date().toISOString() })
    .in('id', removedIds);
}
