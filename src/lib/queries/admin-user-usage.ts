import { createAdminClient } from '@/lib/supabase/admin';
import { estimateCostUsd } from '@/lib/ai/pricing';
import { monthRange } from '@/lib/queries/admin-usage';

export interface EventRow {
  id: string;
  query_type: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  course_id: string | null;
  document_id: string | null;
  created_at: string;
}
export interface MonthlyUsageRow {
  month: string;
  queryCount: number;
  totalTokens: number;
  estimatedCostUsd: number;
}
export interface DailyUsageRow {
  day: string;
  queryCount: number;
  totalTokens: number;
  estimatedCostUsd: number;
}
export interface QueryLogRow {
  id: string;
  createdAt: string;
  queryType: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  documentId: string | null;
}
export interface DocumentUsageRow {
  documentId: string | null;
  title: string;
  queryCount: number;
  totalTokens: number;
  estimatedCostUsd: number;
}

const cost = (e: EventRow) =>
  estimateCostUsd(e.model, e.input_tokens, e.output_tokens);
const tokens = (e: EventRow) => e.input_tokens + e.output_tokens;

export function groupByMonth(events: EventRow[]): MonthlyUsageRow[] {
  const m = new Map<string, MonthlyUsageRow>();
  for (const e of events) {
    const month = e.created_at.slice(0, 7);
    let r = m.get(month);
    if (!r) {
      r = { month, queryCount: 0, totalTokens: 0, estimatedCostUsd: 0 };
      m.set(month, r);
    }
    r.queryCount += 1;
    r.totalTokens += tokens(e);
    r.estimatedCostUsd += cost(e);
  }
  return [...m.values()].sort((a, b) => b.month.localeCompare(a.month));
}

export function groupByDay(events: EventRow[]): DailyUsageRow[] {
  const m = new Map<string, DailyUsageRow>();
  for (const e of events) {
    const day = e.created_at.slice(0, 10);
    let r = m.get(day);
    if (!r) {
      r = { day, queryCount: 0, totalTokens: 0, estimatedCostUsd: 0 };
      m.set(day, r);
    }
    r.queryCount += 1;
    r.totalTokens += tokens(e);
    r.estimatedCostUsd += cost(e);
  }
  return [...m.values()].sort((a, b) => b.day.localeCompare(a.day));
}

export function toQueryLog(events: EventRow[]): QueryLogRow[] {
  return events
    .map((e) => ({
      id: e.id,
      createdAt: e.created_at,
      queryType: e.query_type,
      model: e.model,
      inputTokens: e.input_tokens,
      outputTokens: e.output_tokens,
      estimatedCostUsd: cost(e),
      documentId: e.document_id,
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function groupByDocument(
  events: EventRow[],
  titlesById: Record<string, string>,
): DocumentUsageRow[] {
  const m = new Map<string | null, DocumentUsageRow>();
  for (const e of events) {
    const key = e.document_id;
    let r = m.get(key);
    if (!r) {
      r = {
        documentId: key,
        title: key ? (titlesById[key] ?? '(deleted document)') : 'No document',
        queryCount: 0,
        totalTokens: 0,
        estimatedCostUsd: 0,
      };
      m.set(key, r);
    }
    r.queryCount += 1;
    r.totalTokens += tokens(e);
    r.estimatedCostUsd += cost(e);
  }
  return [...m.values()].sort((a, b) => b.queryCount - a.queryCount);
}

/** Fetch all events for a user (newest first), optionally within a month range. */
export async function fetchUserEvents(
  userId: string,
  range?: { start: string; end: string },
): Promise<EventRow[]> {
  const admin = createAdminClient();
  let q = admin
    .from('ai_usage_events')
    .select(
      'id, query_type, model, input_tokens, output_tokens, course_id, document_id, created_at',
    )
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (range) q = q.gte('created_at', range.start).lt('created_at', range.end);
  const { data, error } = await q;
  if (error) throw error;
  return (data as EventRow[]) ?? [];
}

/** Resolve document titles for a set of ids. */
export async function fetchDocumentTitles(
  ids: string[],
): Promise<Record<string, string>> {
  if (ids.length === 0) return {};
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('documents')
    .select('id, title')
    .in('id', ids);
  if (error) throw error;
  const map: Record<string, string> = {};
  for (const d of data ?? [])
    map[d.id as string] = (d.title as string) ?? '(untitled)';
  return map;
}

export { monthRange };
