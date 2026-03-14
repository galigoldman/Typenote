import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { ImportRequestPayload } from '@/lib/moodle/types';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body: ImportRequestPayload = await request.json();

    if (!body.moodleCourseId || !body.fileIds?.length) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 },
      );
    }

    // Upsert user_course_syncs
    const { data: sync, error: syncError } = await supabase
      .from('user_course_syncs')
      .upsert(
        {
          user_id: user.id,
          moodle_course_id: body.moodleCourseId,
          course_id: body.courseId ?? null,
          last_synced_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,moodle_course_id' },
      )
      .select()
      .single();

    if (syncError) throw new Error(`Sync record failed: ${syncError.message}`);

    // Insert user_file_imports for each file
    const imports = body.fileIds.map((fileId) => ({
      user_id: user.id,
      moodle_file_id: fileId,
      sync_id: sync.id,
      status: 'imported' as const,
    }));

    const { error: importError } = await supabase
      .from('user_file_imports')
      .upsert(imports, { onConflict: 'user_id,moodle_file_id' });

    if (importError)
      throw new Error(`Import record failed: ${importError.message}`);

    return NextResponse.json({
      syncId: sync.id,
      importedCount: body.fileIds.length,
    });
  } catch (error) {
    console.error('Import failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Import failed' },
      { status: 500 },
    );
  }
}
