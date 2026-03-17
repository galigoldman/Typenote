import { NextResponse } from 'next/server';

import { getQuota } from '@/lib/ai/rate-limit';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    // Authenticate user (same pattern as ask route)
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const quota = await getQuota(user.id);

    return NextResponse.json(quota);
  } catch (error) {
    console.error('Quota fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch quota' },
      { status: 500 },
    );
  }
}
