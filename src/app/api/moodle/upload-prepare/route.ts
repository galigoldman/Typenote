import { NextRequest, NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Step 1 of the extension's two-phase upload.
 *
 * Resolves the storage path for the Moodle file (based on instance domain
 * and course id), then returns a one-time signed upload URL that the
 * extension can PUT the file bytes to directly. This bypasses the Vercel
 * Serverless body size limit (4.5MB on Hobby) — the file never traverses
 * the API route, only metadata does.
 *
 * Call /api/moodle/upload-finalize after the PUT succeeds.
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await authenticate(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { sectionId, fileName, contentHash } = body as {
      sectionId?: string;
      fileName?: string;
      contentHash?: string;
    };

    if (!sectionId || !fileName || !contentHash) {
      return NextResponse.json(
        {
          error: `Missing required fields: section=${!!sectionId} name=${!!fileName} hash=${!!contentHash}`,
        },
        { status: 400 },
      );
    }

    const admin = createAdminClient();

    // Resolve the storage path from section → course → instance.
    // Same logic as the legacy /api/moodle/upload route, kept in lockstep
    // so files land at identical paths regardless of which route is used.
    const { data: section, error: sectionError } = await admin
      .from('moodle_sections')
      .select(
        'course_id, moodle_courses(instance_id, moodle_course_id, moodle_instances(domain))',
      )
      .eq('id', sectionId)
      .single();

    if (sectionError) {
      return NextResponse.json(
        {
          error: `Section lookup failed for ${sectionId}: ${sectionError.message}`,
        },
        { status: 400 },
      );
    }

    const domain =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (section as any)?.moodle_courses?.moodle_instances?.domain ?? 'unknown';
    const moodleCourseId =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (section as any)?.moodle_courses?.moodle_course_id ?? 'unknown';

    const ext = fileName.includes('.') ? fileName.split('.').pop() : '';
    const safeFileName = ext ? `${contentHash}.${ext}` : contentHash;
    const storagePath = `${domain}/${moodleCourseId}/${safeFileName}`;

    // The storage key is derived from the SHA-256 content hash, so a
    // pre-existing object at this path is guaranteed to be identical bytes.
    // Short-circuit instead of attempting createSignedUploadUrl — which
    // returns 409 "The resource already exists" and surfaces as a sync
    // failure to the user, even though there is nothing to do.
    const lastSlash = storagePath.lastIndexOf('/');
    const prefix = lastSlash >= 0 ? storagePath.slice(0, lastSlash) : '';
    const leaf =
      lastSlash >= 0 ? storagePath.slice(lastSlash + 1) : storagePath;
    const { data: existingObjs } = await admin.storage
      .from('moodle-materials')
      .list(prefix, { search: leaf });
    if (existingObjs?.some((o) => o.name === leaf)) {
      return NextResponse.json({ alreadyUploaded: true, storagePath });
    }

    const { data: signed, error: signError } = await admin.storage
      .from('moodle-materials')
      .createSignedUploadUrl(storagePath);

    if (signError || !signed) {
      // Race: another caller may have just created the object between our
      // list() and createSignedUploadUrl(). Treat the conflict as success.
      const msg = signError?.message ?? '';
      if (/already exists/i.test(msg)) {
        return NextResponse.json({ alreadyUploaded: true, storagePath });
      }
      return NextResponse.json(
        { error: `Failed to create signed upload URL: ${msg}` },
        { status: 500 },
      );
    }

    return NextResponse.json({
      uploadUrl: signed.signedUrl,
      token: signed.token,
      storagePath,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('upload-prepare error:', msg);
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
