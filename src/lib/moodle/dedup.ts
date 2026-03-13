import type { SupabaseClient } from '@supabase/supabase-js';
import type { DedupCheckResult } from './types';

/**
 * Check if a file already exists in the shared registry.
 * Two-tier strategy: URL match first (fast), then content hash (thorough).
 */
export async function checkFileExists(
  adminClient: SupabaseClient,
  sectionId: string,
  moodleUrl: string,
  contentHash: string | null,
): Promise<DedupCheckResult> {
  // Tier 1: Check by URL within the same section
  const { data: urlMatch } = await adminClient
    .from('moodle_files')
    .select('id, content_hash')
    .eq('section_id', sectionId)
    .eq('moodle_url', moodleUrl)
    .single();

  if (urlMatch) {
    // URL exists — check if content has been stored
    if (!urlMatch.content_hash) {
      // Metadata-only record (not yet downloaded) — needs upload
      return { exists: true, fileId: urlMatch.id, status: 'modified' };
    }
    if (contentHash && urlMatch.content_hash !== contentHash) {
      // Content changed since last download
      return { exists: true, fileId: urlMatch.id, status: 'modified' };
    }
    return { exists: true, fileId: urlMatch.id, status: 'exists' };
  }

  // Tier 2: Check by content hash across ALL files (cross-course dedup)
  if (contentHash) {
    const { data: hashMatch } = await adminClient
      .from('moodle_files')
      .select('id')
      .eq('content_hash', contentHash)
      .limit(1)
      .single();

    if (hashMatch) {
      return { exists: true, fileId: hashMatch.id, status: 'exists' };
    }
  }

  // No match — truly new file
  return { exists: false, status: 'new' };
}
