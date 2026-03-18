import { NextRequest, NextResponse } from 'next/server';

import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/moodle/assignments/splits?assignmentId=<id>
 *
 * Lists all splits for an assignment (RLS enforces visibility).
 * If no AI split exists yet, attempts to create one in-line (deferred split).
 * Returns: { splits: Array<AssignmentSplit & { split_questions: SplitQuestion[] }> }
 */
export async function GET(req: NextRequest) {
  // --- Auth ---
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // --- Validate query params ---
  const { searchParams } = new URL(req.url);
  const assignmentId = searchParams.get('assignmentId');
  if (!assignmentId) {
    return NextResponse.json(
      { error: 'assignmentId query param is required' },
      { status: 400 },
    );
  }

  // --- Fetch splits (user-scoped: RLS handles visibility) ---
  const { data: splits, error: splitsError } = await supabase
    .from('assignment_splits')
    .select('*, split_questions(*)')
    .eq('assignment_id', assignmentId)
    .order('created_at', { ascending: false });

  if (splitsError) {
    console.error('Failed to fetch splits:', splitsError);
    return NextResponse.json(
      { error: 'Failed to fetch splits' },
      { status: 500 },
    );
  }

  // --- Deferred AI split: create one inline if none exists yet ---
  const hasAiSplit = splits?.some(
    (s: { creator_type: string }) => s.creator_type === 'ai',
  );
  if (!hasAiSplit) {
    try {
      const { checkAndIncrementUsage } = await import('@/lib/ai/rate-limit');
      const allowed = await checkAndIncrementUsage(user.id, 'flash');
      if (allowed.isAllowed) {
        const { splitAssignmentWithAi } = await import(
          '@/lib/ai/split-assignment'
        );
        const admin = createAdminClient();
        const { data: assignment } = await admin
          .from('moodle_assignments')
          .select('description_html, content_version')
          .eq('id', assignmentId)
          .single();

        if (assignment) {
          const boundaries = await splitAssignmentWithAi(
            assignment.description_html,
          );
          const { data: newSplit } = await admin
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

          if (newSplit) {
            await admin.from('split_questions').insert(
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

            // Re-fetch with the new split included
            const { data: updatedSplits } = await supabase
              .from('assignment_splits')
              .select('*, split_questions(*)')
              .eq('assignment_id', assignmentId)
              .order('created_at', { ascending: false });

            return NextResponse.json({ splits: updatedSplits ?? [] });
          }
        }
      }
    } catch {
      // Deferred split failed — return what we have rather than blocking the user
    }
  }

  return NextResponse.json({ splits: splits ?? [] });
}

/**
 * POST /api/moodle/assignments/splits
 *
 * Creates a student-authored split (shared or personal).
 * Personal splits replace any existing personal split for this user + assignment.
 *
 * Body:
 *   assignmentId: string
 *   isPersonal: boolean
 *   contentVersion: number
 *   questions: Array<{
 *     label: string; position: number;
 *     boundaryStart: number; boundaryEnd: number;
 *     preambleStart?: number; preambleEnd?: number;
 *     lowConfidence?: boolean;
 *   }>
 *
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
  let isPersonal: boolean;
  let contentVersion: number;
  let questions: Array<{
    label: string;
    position: number;
    boundaryStart: number;
    boundaryEnd: number;
    preambleStart?: number;
    preambleEnd?: number;
    lowConfidence?: boolean;
  }>;

  try {
    const body = await req.json();
    if (!body.assignmentId || typeof body.assignmentId !== 'string') {
      return NextResponse.json(
        { error: 'assignmentId is required' },
        { status: 400 },
      );
    }
    if (typeof body.isPersonal !== 'boolean') {
      return NextResponse.json(
        { error: 'isPersonal (boolean) is required' },
        { status: 400 },
      );
    }
    if (typeof body.contentVersion !== 'number') {
      return NextResponse.json(
        { error: 'contentVersion (number) is required' },
        { status: 400 },
      );
    }
    if (!Array.isArray(body.questions) || body.questions.length === 0) {
      return NextResponse.json(
        { error: 'questions array is required and must not be empty' },
        { status: 400 },
      );
    }
    assignmentId = body.assignmentId;
    isPersonal = body.isPersonal;
    contentVersion = body.contentVersion;
    questions = body.questions;
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const admin = createAdminClient();

  // --- If personal split: delete any existing personal split for this user ---
  // We use the user-scoped client so RLS ensures we only delete our own splits.
  if (isPersonal) {
    const { error: deleteError } = await supabase
      .from('assignment_splits')
      .delete()
      .eq('assignment_id', assignmentId)
      .eq('creator_id', user.id)
      .eq('is_personal', true);

    if (deleteError) {
      console.error('Failed to delete existing personal split:', deleteError);
      return NextResponse.json(
        { error: 'Failed to replace existing personal split' },
        { status: 500 },
      );
    }
  }

  // --- Insert split via admin (sets creator_id properly without RLS blocking) ---
  const { data: newSplit, error: splitError } = await admin
    .from('assignment_splits')
    .insert({
      assignment_id: assignmentId,
      creator_type: 'student',
      creator_id: user.id,
      is_personal: isPersonal,
      content_version: contentVersion,
    })
    .select('id')
    .single();

  if (splitError || !newSplit) {
    console.error('Failed to create split:', splitError);
    return NextResponse.json(
      { error: 'Failed to create split' },
      { status: 500 },
    );
  }

  // --- Insert questions via admin ---
  const { error: questionsError } = await admin.from('split_questions').insert(
    questions.map((q) => ({
      split_id: newSplit.id,
      label: q.label,
      position: q.position,
      boundary_start: q.boundaryStart,
      boundary_end: q.boundaryEnd,
      preamble_start: q.preambleStart ?? null,
      preamble_end: q.preambleEnd ?? null,
      low_confidence: q.lowConfidence ?? false,
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
    { splitId: newSplit.id, questionCount: questions.length },
    { status: 201 },
  );
}
