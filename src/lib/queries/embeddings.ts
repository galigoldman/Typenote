import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export interface EmbeddingRow {
  source_type: string;
  source_id: string;
  segment_index: number;
  page_start: number | null;
  page_end: number | null;
  segment_text: string | null;
  embedding: number[];
  user_id: string | null;
  course_id: string | null;
  week_id: string | null;
  source_name: string | null;
  mime_type: string | null;
  content_hash: string | null;
}

export async function upsertEmbeddings(rows: EmbeddingRow[]): Promise<void> {
  if (rows.length === 0) return;

  const isShared = rows[0].user_id === null;
  const supabase = isShared ? createAdminClient() : await createClient();

  // Delete existing segments for this source
  const sourceType = rows[0].source_type;
  const sourceId = rows[0].source_id;

  await supabase
    .from('content_embeddings')
    .delete()
    .eq('source_type', sourceType)
    .eq('source_id', sourceId);

  // Insert in batches
  const batchSize = 20;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize).map((row) => ({
      ...row,
      embedding: JSON.stringify(row.embedding),
    }));

    const { error } = await supabase.from('content_embeddings').insert(batch);
    if (error) throw new Error(`Failed to insert embeddings: ${error.message}`);
  }
}

export async function deleteEmbeddingsBySource(
  sourceType: string,
  sourceId: string,
): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from('content_embeddings')
    .delete()
    .eq('source_type', sourceType)
    .eq('source_id', sourceId);
}

export async function getContentHash(
  sourceType: string,
  sourceId: string,
): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('content_embeddings')
    .select('content_hash')
    .eq('source_type', sourceType)
    .eq('source_id', sourceId)
    .limit(1)
    .single();

  return data?.content_hash ?? null;
}

export interface MatchResult {
  id: number;
  source_type: string;
  source_id: string;
  source_name: string | null;
  page_start: number | null;
  page_end: number | null;
  course_id: string | null;
  week_id: string | null;
  mime_type: string | null;
  similarity: number;
}

export async function matchEmbeddings(params: {
  queryEmbedding: number[];
  userId: string;
  courseId?: string | null;
  weekId?: string | null;
  matchCount?: number;
  similarityThreshold?: number;
}): Promise<MatchResult[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('match_embeddings', {
    query_embedding: JSON.stringify(params.queryEmbedding),
    match_user_id: params.userId,
    match_course_id: params.courseId ?? null,
    match_week_id: params.weekId ?? null,
    match_count: params.matchCount ?? 8,
    similarity_threshold: params.similarityThreshold ?? 0.3,
  });

  if (error) throw new Error(`match_embeddings failed: ${error.message}`);
  return (data as MatchResult[]) ?? [];
}

export interface FileRef {
  source_type: string;
  source_id: string;
  source_name: string;
  mime_type: string;
  storage_path: string;
}

export async function getWeekFileRefs(
  courseId: string,
  weekId: string,
): Promise<FileRef[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('get_week_file_refs', {
    target_course_id: courseId,
    target_week_id: weekId,
  });

  if (error) throw new Error(`get_week_file_refs failed: ${error.message}`);
  return (data as FileRef[]) ?? [];
}
