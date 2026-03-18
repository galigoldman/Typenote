import { NextRequest, NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const courseId = request.nextUrl.searchParams.get('courseId');
  if (!courseId) {
    return NextResponse.json(
      { error: 'Missing courseId parameter' },
      { status: 400 },
    );
  }

  // Fetch conversations with message count
  const { data: conversations, error } = await supabase
    .from('ai_conversations')
    .select('*, ai_messages(count)')
    .eq('course_id', courseId)
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Transform to include message_count as a flat field
  const result = (conversations || []).map((conv: Record<string, unknown> & { ai_messages?: { count: number }[] }) => ({
    id: conv.id,
    course_id: conv.course_id,
    title: conv.title,
    created_at: conv.created_at,
    updated_at: conv.updated_at,
    message_count: conv.ai_messages?.[0]?.count ?? 0,
  }));

  return NextResponse.json({ conversations: result });
}
