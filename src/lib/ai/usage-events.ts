import { createClient } from '@/lib/supabase/server';

export type AiQueryType = 'chat' | 'latex' | 'embedding';

export interface AiUsageEvent {
  userId: string;
  queryType: AiQueryType;
  model: string;
  inputTokens: number;
  outputTokens: number;
  courseId?: string | null;
  documentId?: string | null;
}

/**
 * Append one row to the AI usage event log. MUST be awaited by callers before
 * the serverless function returns — a dropped (fire-and-forget) write is the
 * cause of the prod $0 bug. Never throws: a metrics-write failure must not fail
 * the user's AI response, but the await guarantees the insert is in flight
 * before the function can freeze.
 */
export async function recordAiEvent(e: AiUsageEvent): Promise<void> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.from('ai_usage_events').insert({
      user_id: e.userId,
      query_type: e.queryType,
      model: e.model,
      input_tokens: e.inputTokens,
      output_tokens: e.outputTokens,
      course_id: e.courseId ?? null,
      document_id: e.documentId ?? null,
    });
    if (error) {
      console.error('[usage-events] failed to record AI event:', error.message);
    }
  } catch (err) {
    console.error('[usage-events] failed to record AI event:', err);
  }
}
