import { NextResponse } from 'next/server';

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

    const { reindexAllContent } = await import('@/lib/actions/ai-context');
    const { processed, failed } = await reindexAllContent();
    return NextResponse.json({
      processed,
      failed,
      message: `Re-indexed ${processed} sources (${failed} failed).`,
    });
  } catch (err) {
    console.error('Reindex error:', err);
    return NextResponse.json({ error: 'Failed to reindex' }, { status: 500 });
  }
}
