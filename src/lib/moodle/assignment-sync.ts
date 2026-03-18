import { createAdminClient } from '@/lib/supabase/admin';

// ============================================
// Assignment upsert types & logic
// ============================================

export interface UpsertAssignmentParams {
  sectionId: string;
  moodleUrl: string;
  moodleModuleId: string;
  title: string;
  descriptionHtml: string;
  dueDate: string | null;
}

export interface UpsertAssignmentResult {
  assignmentId: string;
  isNew: boolean;
  contentChanged: boolean;
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

    return { assignmentId: created!.id, isNew: true, contentChanged: false };
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

    return { assignmentId: updated!.id, isNew: false, contentChanged: true };
  }

  return { assignmentId: existing.id, isNew: false, contentChanged: false };
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
