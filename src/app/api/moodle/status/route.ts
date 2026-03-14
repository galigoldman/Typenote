import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getUserImportedFileIds } from '@/lib/queries/moodle';

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const moodleCourseId = request.nextUrl.searchParams.get('moodleCourseId');
  if (!moodleCourseId) {
    return NextResponse.json(
      { error: 'Missing moodleCourseId' },
      { status: 400 },
    );
  }

  try {
    // Get sync record
    const { data: sync } = await supabase
      .from('user_course_syncs')
      .select('last_synced_at')
      .eq('user_id', user.id)
      .eq('moodle_course_id', moodleCourseId)
      .single();

    const { importedFileIds, removedFileIds } = await getUserImportedFileIds(
      user.id,
      moodleCourseId,
    );

    return NextResponse.json({
      lastSyncedAt: sync?.last_synced_at ?? null,
      importedFileIds,
      removedFileIds,
      modifiedFileIds: [], // Populated by change detection during re-sync
    });
  } catch (error) {
    console.error('Status check failed:', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Status check failed',
      },
      { status: 500 },
    );
  }
}
