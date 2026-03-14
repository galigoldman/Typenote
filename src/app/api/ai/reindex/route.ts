import { NextResponse } from 'next/server';

import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export async function POST() {
  try {
    // Auth check
    const supabase = await createClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (error || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Delete all embeddings — they'll be recreated on next sync with correct taskType
    const admin = createAdminClient();
    const { data, error: deleteError } = await admin
      .from('content_embeddings')
      .delete()
      .neq('id', 0) // delete all rows
      .select('id');

    if (deleteError) {
      return NextResponse.json(
        { error: `Delete failed: ${deleteError.message}` },
        { status: 500 },
      );
    }

    return NextResponse.json({
      deleted: data?.length ?? 0,
      message:
        'All embeddings deleted. Re-sync your courses to rebuild with correct embeddings.',
    });
  } catch (err) {
    console.error('Reindex error:', err);
    return NextResponse.json({ error: 'Failed to reindex' }, { status: 500 });
  }
}
