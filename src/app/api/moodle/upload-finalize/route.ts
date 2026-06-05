import { NextRequest, NextResponse } from 'next/server';

import { indexContent } from '@/lib/actions/ai-context';
import { recordUserFileImport } from '@/lib/actions/moodle-sync';
import { scheduleAfterResponse } from '@/lib/server/after-response';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Step 2 of the extension's two-phase upload.
 *
 * Called after the extension has PUT the file bytes to the signed URL
 * returned by /api/moodle/upload-prepare. Verifies the object actually
 * landed in storage (defense against a client that calls finalize
 * without finishing the upload), then creates/updates the
 * `moodle_files` row and kicks off AI indexing.
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await authenticate(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      sectionId,
      moodleUrl,
      fileName,
      contentHash,
      storagePath,
      fileSize,
      mimeType,
    } = body as {
      sectionId?: string;
      moodleUrl?: string;
      fileName?: string;
      contentHash?: string;
      storagePath?: string;
      fileSize?: number;
      mimeType?: string;
    };

    if (
      !sectionId ||
      !moodleUrl ||
      !fileName ||
      !contentHash ||
      !storagePath ||
      typeof fileSize !== 'number'
    ) {
      return NextResponse.json(
        {
          error: `Missing fields: section=${!!sectionId} url=${!!moodleUrl} name=${!!fileName} hash=${!!contentHash} path=${!!storagePath} size=${typeof fileSize === 'number'}`,
        },
        { status: 400 },
      );
    }

    const admin = createAdminClient();

    // Trust-but-verify: confirm the signed-URL upload actually completed.
    // We list the parent prefix and check for the leaf file. If a caller
    // got the signed URL but never PUT the bytes, we must NOT create a DB
    // row pointing at a missing object.
    const lastSlash = storagePath.lastIndexOf('/');
    const prefix = lastSlash >= 0 ? storagePath.slice(0, lastSlash) : '';
    const leaf =
      lastSlash >= 0 ? storagePath.slice(lastSlash + 1) : storagePath;
    const { data: objs } = await admin.storage
      .from('moodle-materials')
      .list(prefix, { search: leaf });
    const exists = objs?.some((o) => o.name === leaf) ?? false;
    if (!exists) {
      return NextResponse.json(
        {
          error: `Storage object missing at ${storagePath} — did the PUT succeed?`,
        },
        { status: 400 },
      );
    }

    // Resolve appCourseId for AI indexing (best-effort).
    const moodleCourseDbId = await admin
      .from('moodle_sections')
      .select('course_id')
      .eq('id', sectionId)
      .single()
      .then((r) => r.data?.course_id ?? null);

    let appCourseId: string | null = null;
    if (moodleCourseDbId) {
      const { data: syncRecord } = await admin
        .from('user_course_syncs')
        .select('course_id')
        .eq('user_id', userId)
        .eq('moodle_course_id', moodleCourseDbId)
        .single();
      appCourseId = syncRecord?.course_id ?? null;
    }

    const mime = mimeType || 'application/octet-stream';

    // Same upsert behavior as the legacy /api/moodle/upload route: try to
    // update an existing scrape-time row first, fall back to insert.
    const { data: fileRecord, error: updateError } = await admin
      .from('moodle_files')
      .update({
        content_hash: contentHash,
        storage_path: storagePath,
        file_size: fileSize,
        mime_type: mime,
      })
      .eq('section_id', sectionId)
      .eq('moodle_url', moodleUrl)
      .select()
      .single();

    if (!updateError && fileRecord) {
      if (moodleCourseDbId) {
        // Awaited: a dropped user_file_imports row (serverless freeze) makes
        // course_moodle_view return [] imported ids, which hides the file from
        // AI search even when it's embedded. Non-fatal — log and continue.
        await recordUserFileImport(
          userId,
          fileRecord.id,
          moodleCourseDbId,
        ).catch((err) =>
          console.error('user_file_imports upsert failed:', err),
        );
      }
      // Index for AI search in the BACKGROUND (after the response). Embedding
      // takes tens of seconds; the user's sync must not wait on it. scheduleAfter-
      // Response uses Next after() so the work survives the serverless freeze.
      if (appCourseId) {
        const fileId = fileRecord.id;
        scheduleAfterResponse(async () => {
          try {
            await indexContent({
              type: 'moodle_file',
              fileId,
              courseId: appCourseId,
              triggeredByUserId: userId,
            });
          } catch (err) {
            console.error('Background index failed:', err);
          }
        });
      }
      return NextResponse.json({
        fileId: fileRecord.id,
        deduplicated: false,
        storagePath,
      });
    }

    const { data: newRecord, error: insertError } = await admin
      .from('moodle_files')
      .insert({
        section_id: sectionId,
        type: 'file',
        moodle_url: moodleUrl,
        file_name: fileName,
        content_hash: contentHash,
        storage_path: storagePath,
        file_size: fileSize,
        mime_type: mime,
        position: 0,
      })
      .select()
      .single();

    if (insertError) {
      return NextResponse.json(
        { error: `File record failed: ${insertError.message}` },
        { status: 500 },
      );
    }

    if (moodleCourseDbId) {
      // Awaited: a dropped user_file_imports row (serverless freeze) makes
      // course_moodle_view return [] imported ids, which hides the file from
      // AI search even when it's embedded. Non-fatal — log and continue.
      await recordUserFileImport(userId, newRecord.id, moodleCourseDbId).catch(
        (err) => console.error('user_file_imports upsert failed:', err),
      );
    }
    // Index for AI search in the BACKGROUND (after the response) — see above.
    if (appCourseId) {
      const fileId = newRecord.id;
      scheduleAfterResponse(async () => {
        try {
          await indexContent({
            type: 'moodle_file',
            fileId,
            courseId: appCourseId,
            triggeredByUserId: userId,
          });
        } catch (err) {
          console.error('Background index failed:', err);
        }
      });
    }

    return NextResponse.json({
      fileId: newRecord.id,
      deduplicated: false,
      storagePath,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('upload-finalize error:', msg);
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
