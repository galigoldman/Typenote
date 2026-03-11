import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { upsertMoodleData } from '@/lib/moodle/sync-service';
import type { SyncRequestPayload } from '@/lib/moodle/types';

export async function POST(request: NextRequest) {
  // Verify authentication
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body: SyncRequestPayload = await request.json();

    if (!body.instanceDomain || !body.courses) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 },
      );
    }

    const result = await upsertMoodleData(body);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Sync failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Sync failed' },
      { status: 500 },
    );
  }
}
