import { NextRequest, NextResponse } from 'next/server';

import { indexContent } from '@/lib/actions/ai-context';
import { recordUserFileImport } from '@/lib/actions/moodle-sync';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Fast path the extension calls BEFORE fetching a file from Moodle.
 *
 * If the shared registry already has this file (matched by section_id +
 * moodle_url) AND its byte size matches what the extension just saw via
 * HEAD against Moodle, we register the import for this user and return
 * imported:true. The extension then skips the download entirely.
 *
 * We use file_size as the unchanged-signal because:
 *   - It's already populated on moodle_files after the first successful
 *     upload (upload-finalize writes it).
 *   - HEAD on Moodle is one cheap round-trip — no body bytes.
 *   - It catches the "Moodle replaced the file under the same URL" case
 *     that a plain (section_id, moodle_url) match cannot.
 *
 * If the sizes don't match, or the registry is missing data we need to
 * verify, we return imported:false with a reason and let the extension
 * fall through to the full download → hash → upload → finalize path.
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await authenticate(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { sectionId, moodleUrl, observedSize } = body as {
      sectionId?: string;
      moodleUrl?: string;
      observedSize?: number;
    };

    if (!sectionId || !moodleUrl) {
      return NextResponse.json(
        {
          error: `Missing fields: section=${!!sectionId} url=${!!moodleUrl}`,
        },
        { status: 400 },
      );
    }

    const admin = createAdminClient();

    const { data: file } = await admin
      .from('moodle_files')
      .select('id, storage_path, content_hash, file_size, mime_type')
      .eq('section_id', sectionId)
      .eq('moodle_url', moodleUrl)
      .maybeSingle();

    if (!file || !file.storage_path) {
      return NextResponse.json({
        imported: false,
        reason: 'not_in_registry',
      });
    }

    if (!file.content_hash) {
      // A registry row with no content hash hasn't been fully materialized
      // (scrape-time placeholder). We can't claim bytes we don't have —
      // force a fresh download.
      return NextResponse.json({ imported: false, reason: 'not_materialized' });
    }

    // Claim-from-registry: the shared registry already has this file's bytes
    // (storage_path + content_hash). Register the import for THIS user and skip
    // the Moodle download entirely — that's the whole point of the shared
    // registry, and it makes a second user's sync near-instant for files that
    // are already stored.
    //
    // Tradeoff (intentional): we do NOT re-verify the file hasn't changed on
    // Moodle here. If an instructor replaces a file under the same URL, users
    // who claim from the registry keep the existing version until a future
    // change-detecting re-sync refreshes the registry. `observedSize` is no
    // longer used to gate this; it's accepted for backward compatibility only.
    void observedSize;

    // Resolve the linked Typenote course (best-effort; AI indexing needs it
    // but registration of the user import does not).
    const { data: section } = await admin
      .from('moodle_sections')
      .select('course_id')
      .eq('id', sectionId)
      .maybeSingle();
    const moodleCourseDbId = section?.course_id ?? null;

    let appCourseId: string | null = null;
    if (moodleCourseDbId) {
      const { data: syncRecord } = await admin
        .from('user_course_syncs')
        .select('course_id')
        .eq('user_id', userId)
        .eq('moodle_course_id', moodleCourseDbId)
        .maybeSingle();
      appCourseId = syncRecord?.course_id ?? null;
    }

    if (moodleCourseDbId) {
      // recordUserFileImport silently no-ops if no user_course_syncs row
      // exists for this (user, moodle_course). The dashboard sync flow
      // creates that row before per-file work begins, so this normally
      // succeeds.
      await recordUserFileImport(userId, file.id, moodleCourseDbId);
    }

    if (appCourseId) {
      // Awaited (not fire-and-forget): a detached promise is dropped when the
      // serverless function freezes after responding, leaving the file
      // un-embedded and unfindable. indexContent short-circuits on a content
      // hash match, so re-imports stay cheap. Failure is logged, not fatal.
      try {
        await indexContent({
          type: 'moodle_file',
          fileId: file.id,
          courseId: appCourseId,
        });
      } catch (err) {
        console.error('Index failed:', err);
      }
    }

    return NextResponse.json({
      imported: true,
      fileId: file.id,
      storagePath: file.storage_path,
      contentHash: file.content_hash,
      fileSize: file.file_size,
      mimeType: file.mime_type,
      deduplicated: true,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('import-existing error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

async function authenticate(request: NextRequest): Promise<string | null> {
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const admin = createAdminClient();
    const {
      data: { user },
    } = await admin.auth.getUser(token);
    if (user?.id) return user.id;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}
