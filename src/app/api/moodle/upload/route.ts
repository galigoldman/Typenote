import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkFileExists } from '@/lib/moodle/dedup';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const sectionId = formData.get('sectionId') as string;
    const moodleUrl = formData.get('moodleUrl') as string;
    const fileName = formData.get('fileName') as string;
    const contentHash = formData.get('contentHash') as string;

    if (!file || !sectionId || !moodleUrl || !fileName || !contentHash) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 },
      );
    }

    const admin = createAdminClient();

    // Dedup check
    const dedupResult = await checkFileExists(
      admin,
      sectionId,
      moodleUrl,
      contentHash,
    );

    if (dedupResult.status === 'exists') {
      return NextResponse.json({
        fileId: dedupResult.fileId,
        deduplicated: true,
        storagePath: null,
      });
    }

    // Upload file to storage
    const fileBuffer = Buffer.from(await file.arrayBuffer());

    // Get the instance domain and course id for the storage path
    const { data: section } = await admin
      .from('moodle_sections')
      .select(
        'course_id, moodle_courses(instance_id, moodle_course_id, moodle_instances(domain))',
      )
      .eq('id', sectionId)
      .single();

    const sectionData = section as Record<string, unknown> | null;
    const moodleCourses = sectionData?.moodle_courses as Record<string, unknown> | undefined;
    const moodleInstances = moodleCourses?.moodle_instances as Record<string, unknown> | undefined;
    const domain = (moodleInstances?.domain as string) ?? 'unknown';
    const courseId = (moodleCourses?.moodle_course_id as string) ?? 'unknown';
    const storagePath = `${domain}/${courseId}/${contentHash}_${fileName}`;

    const { error: uploadError } = await admin.storage
      .from('moodle-materials')
      .upload(storagePath, fileBuffer, {
        contentType: file.type,
        upsert: true,
      });

    if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

    if (dedupResult.status === 'modified' && dedupResult.fileId) {
      // Update existing file record
      const { data: updated, error: updateError } = await admin
        .from('moodle_files')
        .update({
          content_hash: contentHash,
          storage_path: storagePath,
          file_size: file.size,
          mime_type: file.type,
        })
        .eq('id', dedupResult.fileId)
        .select()
        .single();

      if (updateError)
        throw new Error(`File update failed: ${updateError.message}`);

      return NextResponse.json({
        fileId: updated.id,
        deduplicated: false,
        storagePath,
      });
    }

    // Update the file record that was created during sync (status: 'new')
    const { data: fileRecord, error: fileError } = await admin
      .from('moodle_files')
      .update({
        content_hash: contentHash,
        storage_path: storagePath,
        file_size: file.size,
        mime_type: file.type,
      })
      .eq('section_id', sectionId)
      .eq('moodle_url', moodleUrl)
      .select()
      .single();

    if (fileError)
      throw new Error(`File record update failed: ${fileError.message}`);

    return NextResponse.json({
      fileId: fileRecord.id,
      deduplicated: false,
      storagePath,
    });
  } catch (error) {
    console.error('Upload failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Upload failed' },
      { status: 500 },
    );
  }
}
