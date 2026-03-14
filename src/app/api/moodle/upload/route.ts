import { NextRequest, NextResponse } from 'next/server';

import { indexContent } from '@/lib/actions/ai-context';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(request: NextRequest) {
  try {
    // Auth: try Bearer token first (extension uploads), fall back to cookies
    let userId: string | null = null;

    const authHeader = request.headers.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      // Use admin client to verify the token
      const admin = createAdminClient();
      const { data: { user: tokenUser } } = await admin.auth.getUser(token);
      userId = tokenUser?.id ?? null;
    }

    if (!userId) {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      userId = user?.id ?? null;
    }

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const sectionId = formData.get('sectionId') as string;
    const moodleUrl = formData.get('moodleUrl') as string;
    const fileName = formData.get('fileName') as string;
    const contentHash = formData.get('contentHash') as string;

    if (!file || !sectionId || !moodleUrl || !fileName || !contentHash) {
      return NextResponse.json(
        { error: `Missing required fields: file=${!!file} section=${!!sectionId} url=${!!moodleUrl} name=${!!fileName} hash=${!!contentHash}` },
        { status: 400 },
      );
    }

    const admin = createAdminClient();
    const fileBuffer = Buffer.from(await file.arrayBuffer());

    // Resolve app course ID for AI indexing
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

    // Get the instance domain and course id for the storage path
    const { data: section, error: sectionError } = await admin
      .from('moodle_sections')
      .select(
        'course_id, moodle_courses(instance_id, moodle_course_id, moodle_instances(domain))',
      )
      .eq('id', sectionId)
      .single();

    if (sectionError) {
      return NextResponse.json(
        { error: `Section lookup failed for ${sectionId}: ${sectionError.message}` },
        { status: 400 },
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const domain = (section as any)?.moodle_courses?.moodle_instances?.domain ?? 'unknown';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const moodleCourseId = (section as any)?.moodle_courses?.moodle_course_id ?? 'unknown';
    // Supabase Storage keys must be ASCII — use content hash as the key,
    // store the original file name in the DB record only
    const ext = fileName.includes('.') ? fileName.split('.').pop() : '';
    const safeFileName = ext ? `${contentHash}.${ext}` : contentHash;
    const storagePath = `${domain}/${moodleCourseId}/${safeFileName}`;

    // Upload file to storage
    const { error: uploadError } = await admin.storage
      .from('moodle-materials')
      .upload(storagePath, fileBuffer, {
        contentType: file.type || 'application/octet-stream',
        upsert: true,
      });

    if (uploadError) {
      return NextResponse.json(
        { error: `Storage upload failed: ${uploadError.message}` },
        { status: 500 },
      );
    }

    // Try to update existing file record (created during sync)
    const { data: fileRecord, error: fileError } = await admin
      .from('moodle_files')
      .update({
        content_hash: contentHash,
        storage_path: storagePath,
        file_size: file.size,
        mime_type: file.type || 'application/octet-stream',
      })
      .eq('section_id', sectionId)
      .eq('moodle_url', moodleUrl)
      .select()
      .single();

    if (!fileError && fileRecord) {
      // Index for AI search (fire-and-forget)
      if (appCourseId) {
        indexContent({ type: 'moodle_file', fileId: fileRecord.id, courseId: appCourseId })
          .catch((err) => console.error('Index failed:', err));
      }
      return NextResponse.json({
        fileId: fileRecord.id,
        deduplicated: false,
        storagePath,
      });
    }

    // No existing record — insert a new one
    const { data: newRecord, error: insertError } = await admin
      .from('moodle_files')
      .insert({
        section_id: sectionId,
        type: 'file',
        moodle_url: moodleUrl,
        file_name: fileName,
        content_hash: contentHash,
        storage_path: storagePath,
        file_size: file.size,
        mime_type: file.type || 'application/octet-stream',
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

    // Index for AI search (fire-and-forget)
    if (appCourseId) {
      indexContent({ type: 'moodle_file', fileId: newRecord.id, courseId: appCourseId })
        .catch((err) => console.error('Index failed:', err));
    }

    return NextResponse.json({
      fileId: newRecord.id,
      deduplicated: false,
      storagePath,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('Upload route error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
