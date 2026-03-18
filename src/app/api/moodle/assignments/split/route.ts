import { NextRequest, NextResponse } from 'next/server';

import { checkAndIncrementUsage } from '@/lib/ai/rate-limit';
import { splitAssignmentWithAi } from '@/lib/ai/split-assignment';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

/**
 * POST /api/moodle/assignments/split
 *
 * Triggers an AI split for a given assignment. Requires authentication and
 * checks/increments the caller's AI quota before any expensive work.
 *
 * Body: { assignmentId: string }
 * Returns: { splitId: string, questionCount: number }
 */
export async function POST(req: NextRequest) {
  // --- Auth ---
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // --- Validate body ---
  let assignmentId: string;
  try {
    const body = await req.json();
    if (!body.assignmentId || typeof body.assignmentId !== 'string') {
      return NextResponse.json(
        { error: 'assignmentId is required' },
        { status: 400 },
      );
    }
    assignmentId = body.assignmentId;
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  // --- Fetch the assignment (admin so we can read any assignment) ---
  const admin = createAdminClient();
  const { data: assignment, error: assignmentError } = await admin
    .from('moodle_assignments')
    .select('id, description_html, content_version')
    .eq('id', assignmentId)
    .single();

  if (assignmentError || !assignment) {
    return NextResponse.json(
      { error: 'Assignment not found' },
      { status: 404 },
    );
  }

  // --- Rate limit check (atomic check + increment) ---
  // Using 'flash' model label since AI splitting uses gemini-2.5-flash.
  // Fail-closed: if the RPC fails, reject rather than risk unbounded cost.
  let rateLimit;
  try {
    rateLimit = await checkAndIncrementUsage(user.id, 'flash');
  } catch (err) {
    console.error('Rate limit check failed during split trigger:', err);
    return NextResponse.json(
      {
        error: 'service_unavailable',
        message: 'AI service is temporarily unavailable. Please try again.',
      },
      { status: 503 },
    );
  }

  if (!rateLimit.isAllowed) {
    const now = new Date();
    const resetsAt = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
    );
    return NextResponse.json(
      {
        error: 'rate_limited',
        message: `You've used all ${rateLimit.monthlyLimit} of your monthly AI queries.`,
        used: rateLimit.currentCount,
        limit: rateLimit.monthlyLimit,
        resetsAt: resetsAt.toISOString(),
      },
      { status: 429 },
    );
  }

  // --- AI split ---
  let boundaries;
  try {
    boundaries = await splitAssignmentWithAi(assignment.description_html);
  } catch (err) {
    console.error('AI split failed:', err);
    return NextResponse.json(
      { error: 'AI split failed', message: 'Failed to split assignment with AI' },
      { status: 500 },
    );
  }

  // --- Persist split + questions via admin (bypasses RLS; creator_type = 'ai') ---
  const { data: newSplit, error: splitError } = await admin
    .from('assignment_splits')
    .insert({
      assignment_id: assignmentId,
      creator_type: 'ai',
      creator_id: null,
      is_personal: false,
      content_version: assignment.content_version,
    })
    .select('id')
    .single();

  if (splitError || !newSplit) {
    console.error('Failed to save split:', splitError);
    return NextResponse.json(
      { error: 'Failed to save split' },
      { status: 500 },
    );
  }

  const { error: questionsError } = await admin.from('split_questions').insert(
    boundaries.map((b) => ({
      split_id: newSplit.id,
      label: b.label,
      position: b.position,
      boundary_start: b.boundaryStart,
      boundary_end: b.boundaryEnd,
      preamble_start: b.preambleStart ?? null,
      preamble_end: b.preambleEnd ?? null,
      low_confidence: b.lowConfidence ?? false,
    })),
  );

  if (questionsError) {
    console.error('Failed to save questions:', questionsError);
    return NextResponse.json(
      { error: 'Failed to save split questions' },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { splitId: newSplit.id, questionCount: boundaries.length },
    { status: 200 },
  );
}
