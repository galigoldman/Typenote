'use server';

import crypto from 'crypto';

import { generateText } from 'ai';

import { getOrCreateCache } from '@/lib/ai/context-cache';
import { embedFileSegment, embedQuery, embedText } from '@/lib/ai/embeddings';
import { extractDocxText } from '@/lib/ai/extraction/docx';
import { SYSTEM_PROMPT } from '@/lib/ai/prompts';
import { getFlashModel, getProModel } from '@/lib/ai/provider';
import {
  deleteEmbeddingsBySource,
  getContentHash,
  getWeekFileRefs,
  matchEmbeddings,
  upsertEmbeddings,
  type EmbeddingRow,
  type MatchResult,
} from '@/lib/queries/embeddings';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type IndexSource =
  | { type: 'moodle_file'; fileId: string; courseId: string; weekId?: string }
  | { type: 'course_material'; materialId: string; courseId: string; weekId: string };

export type IndexResult = {
  success: boolean;
  segmentsIndexed: number;
  skipped: boolean;
  error?: string;
};

export type SearchParams = {
  query: string;
  courseId: string;
  weekId?: string;
  maxResults?: number;
};

export type SearchResult = {
  id: number;
  sourceType: string;
  sourceId: string;
  sourceName: string;
  pageStart: number | null;
  pageEnd: number | null;
  courseId: string;
  weekId: string | null;
  mimeType: string | null;
  similarity: number;
};

export type QuestionParams = {
  question: string;
  courseId: string;
  weekId?: string;
  documentId?: string;
  mode: 'quick' | 'deep';
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
};

export type QuestionResult = {
  answer: string;
  sources: Array<{
    sourceType: string;
    sourceName: string;
    weekId: string | null;
    pageRange: string | null;
  }>;
  model: 'flash' | 'pro';
  cached: boolean;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sha256(data: Buffer | string): string {
  return crypto
    .createHash('sha256')
    .update(typeof data === 'string' ? data : new Uint8Array(data))
    .digest('hex');
}

async function getAuthUserId(): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) throw new Error('Unauthorized');
  return user.id;
}

const PAGES_PER_SEGMENT = 6;

// ---------------------------------------------------------------------------
// indexContent — multimodal embedding for PDFs/PPTX, text for DOCX
// ---------------------------------------------------------------------------

export async function indexContent(source: IndexSource): Promise<IndexResult> {
  try {
    let fileBuffer: Buffer;
    let sourceName = '';
    let sourceType = '';
    let sourceId = '';
    let userId: string | null = null;
    let courseId: string | null = null;
    let weekId: string | null = null;
    let mimeType = 'application/octet-stream';
    let storageBucket = '';

    if (source.type === 'moodle_file') {
      const admin = createAdminClient();
      sourceType = 'moodle_file';
      sourceId = source.fileId;
      courseId = source.courseId;
      weekId = source.weekId ?? null;
      userId = null;

      const { data: fileRow, error: fileErr } = await admin
        .from('moodle_files')
        .select('storage_path, file_name, mime_type')
        .eq('id', source.fileId)
        .single();

      if (fileErr || !fileRow?.storage_path) {
        return { success: false, segmentsIndexed: 0, skipped: false, error: 'Moodle file not found or no storage path' };
      }

      sourceName = fileRow.file_name;
      mimeType = fileRow.mime_type ?? 'application/octet-stream';
      storageBucket = 'moodle-materials';

      const { data: fileData, error: dlErr } = await admin.storage
        .from(storageBucket)
        .download(fileRow.storage_path);

      if (dlErr || !fileData) {
        return { success: false, segmentsIndexed: 0, skipped: false, error: 'Failed to download moodle file' };
      }

      fileBuffer = Buffer.from(await fileData.arrayBuffer());
    } else {
      const supabase = await createClient();
      userId = await getAuthUserId();
      sourceType = 'course_material';
      sourceId = source.materialId;
      courseId = source.courseId;
      weekId = source.weekId;

      const { data: matRow, error: matErr } = await supabase
        .from('course_materials')
        .select('storage_path, file_name, mime_type')
        .eq('id', source.materialId)
        .single();

      if (matErr || !matRow) {
        return { success: false, segmentsIndexed: 0, skipped: false, error: 'Course material not found' };
      }

      sourceName = matRow.file_name;
      mimeType = matRow.mime_type ?? 'application/octet-stream';
      storageBucket = 'course-materials';

      const { data: fileData, error: dlErr } = await supabase.storage
        .from(storageBucket)
        .download(matRow.storage_path);

      if (dlErr || !fileData) {
        return { success: false, segmentsIndexed: 0, skipped: false, error: 'Failed to download course material' };
      }

      fileBuffer = Buffer.from(await fileData.arrayBuffer());
    }

    // Check content hash — skip if unchanged
    const hash = sha256(fileBuffer);
    const existingHash = await getContentHash(sourceType, sourceId);
    if (existingHash === hash) {
      return { success: true, segmentsIndexed: 0, skipped: true };
    }

    const rows: EmbeddingRow[] = [];

    if (mimeType === 'application/pdf' || mimeType.includes('presentationml') || mimeType.includes('powerpoint')) {
      // Multimodal embedding — embed raw file as one segment
      // For large PDFs, the Embedding 2 API handles up to 6 pages per call.
      // We send the full file and let the API process it.
      // TODO: For 500+ page PDFs, implement page-level splitting with a PDF library
      const embedding = await embedFileSegment(fileBuffer, mimeType);

      rows.push({
        source_type: sourceType,
        source_id: sourceId,
        segment_index: 0,
        page_start: 1,
        page_end: null, // unknown without parsing — API handles internally
        segment_text: null,
        embedding,
        user_id: userId,
        course_id: courseId,
        week_id: weekId,
        source_name: sourceName,
        mime_type: mimeType,
        content_hash: hash,
      });
    } else if (mimeType.includes('wordprocessingml') || mimeType === 'application/msword') {
      // DOCX — extract text, embed as text
      const text = await extractDocxText(fileBuffer);
      if (!text.trim()) {
        return { success: true, segmentsIndexed: 0, skipped: true };
      }

      const embedding = await embedText(text);
      rows.push({
        source_type: sourceType,
        source_id: sourceId,
        segment_index: 0,
        page_start: null,
        page_end: null,
        segment_text: text.slice(0, 10000), // store first 10K chars for reference
        embedding,
        user_id: userId,
        course_id: courseId,
        week_id: weekId,
        source_name: sourceName,
        mime_type: mimeType,
        content_hash: hash,
      });
    } else {
      return { success: false, segmentsIndexed: 0, skipped: false, error: `Unsupported mime type: ${mimeType}` };
    }

    await upsertEmbeddings(rows);

    return { success: true, segmentsIndexed: rows.length, skipped: false };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('indexContent error:', message);
    return { success: false, segmentsIndexed: 0, skipped: false, error: message };
  }
}

// ---------------------------------------------------------------------------
// searchContext — semantic search returning file refs with page ranges
// ---------------------------------------------------------------------------

export async function searchContext(params: SearchParams): Promise<SearchResult[]> {
  const userId = await getAuthUserId();
  const queryEmbedding = await embedQuery(params.query);

  const matches: MatchResult[] = await matchEmbeddings({
    queryEmbedding,
    userId,
    courseId: params.courseId,
    weekId: params.weekId ?? null,
    matchCount: params.maxResults ?? 8,
  });

  return matches.map((m) => ({
    id: m.id,
    sourceType: m.source_type,
    sourceId: m.source_id,
    sourceName: m.source_name ?? 'Unknown',
    pageStart: m.page_start,
    pageEnd: m.page_end,
    courseId: params.courseId,
    weekId: m.week_id,
    mimeType: m.mime_type,
    similarity: m.similarity,
  }));
}

// ---------------------------------------------------------------------------
// askQuestion — downloads raw PDFs, sends to Gemini as file parts
// ---------------------------------------------------------------------------

export async function askQuestion(params: QuestionParams): Promise<QuestionResult> {
  const userId = await getAuthUserId();
  const { question, courseId, weekId, mode, conversationHistory } = params;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fileParts: Array<{ type: 'file'; data: Buffer; mimeType: string }> = [];
  const sourcesUsed: QuestionResult['sources'] = [];

  if (weekId) {
    // ----- Full-context mode: download raw files for the week -----
    const fileRefs = await getWeekFileRefs(courseId, weekId);

    for (const ref of fileRefs) {
      try {
        const bucket = ref.source_type === 'moodle_file' ? 'moodle-materials' : 'course-materials';
        const supabase = ref.source_type === 'moodle_file' ? createAdminClient() : await createClient();
        const { data: fileData } = await supabase.storage.from(bucket).download(ref.storage_path);

        if (fileData) {
          const buffer = Buffer.from(await fileData.arrayBuffer());
          fileParts.push({
            type: 'file',
            data: buffer,
            mimeType: ref.mime_type ?? 'application/pdf',
          });
          sourcesUsed.push({
            sourceType: ref.source_type,
            sourceName: ref.source_name,
            weekId,
            pageRange: null,
          });
        }
      } catch (err) {
        console.error(`Failed to download ${ref.source_name}:`, err);
      }
    }

    // Cross-week RAG supplement
    const crossWeekResults = await searchContext({
      query: question,
      courseId,
      maxResults: 4,
    });

    for (const r of crossWeekResults.filter((r) => r.weekId !== weekId)) {
      sourcesUsed.push({
        sourceType: r.sourceType,
        sourceName: r.sourceName,
        weekId: r.weekId,
        pageRange: r.pageStart && r.pageEnd ? `pages ${r.pageStart}-${r.pageEnd}` : null,
      });
    }
  } else {
    // ----- RAG-only mode -----
    const results = await searchContext({
      query: question,
      courseId,
      maxResults: 8,
    });

    for (const r of results) {
      sourcesUsed.push({
        sourceType: r.sourceType,
        sourceName: r.sourceName,
        weekId: r.weekId,
        pageRange: r.pageStart && r.pageEnd ? `pages ${r.pageStart}-${r.pageEnd}` : null,
      });
    }
  }

  // Build messages
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contentParts: any[] = [];

  // Add file parts (raw PDFs for Gemini to read)
  for (const fp of fileParts) {
    contentParts.push({
      type: 'file',
      data: fp.data,
      mimeType: fp.mimeType,
    });
  }

  // Add source reference text for RAG results (no file download for cross-week)
  if (sourcesUsed.length > 0 && fileParts.length === 0) {
    const sourceList = sourcesUsed
      .map((s) => `- ${s.sourceName}${s.pageRange ? ` (${s.pageRange})` : ''}${s.weekId ? ` [Week: ${s.weekId}]` : ''}`)
      .join('\n');
    contentParts.push({
      type: 'text',
      text: `Relevant course materials found:\n${sourceList}\n\nPlease answer based on the provided documents.`,
    });
  }

  // Build conversation
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const messages: any[] = [
    { role: 'system', content: SYSTEM_PROMPT },
  ];

  // Add context message with file parts
  if (contentParts.length > 0) {
    contentParts.push({
      type: 'text',
      text: 'I have attached the course materials above. Please review them to answer my question.',
    });

    messages.push({ role: 'user', content: contentParts });
    messages.push({
      role: 'assistant',
      content: 'I have reviewed the course materials. Please ask your question.',
    });
  }

  // Add conversation history
  if (conversationHistory?.length) {
    for (const msg of conversationHistory) {
      messages.push({ role: msg.role, content: msg.content });
    }
  }

  // Add the current question
  messages.push({ role: 'user', content: question });

  // Select model
  const modelFn = mode === 'deep' ? getProModel : getFlashModel;

  // Try shared context cache
  let cached = false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const generateOptions: Record<string, any> = {
    model: modelFn(),
    messages,
  };

  if (weekId && fileParts.length > 0) {
    try {
      const materialsHash = sourcesUsed.map((s) => s.sourceName).sort().join('|');
      const cacheResult = await getOrCreateCache(courseId, weekId, materialsHash);
      if (cacheResult.cacheName) {
        generateOptions.providerOptions = {
          google: { cachedContent: cacheResult.cacheName },
        };
        cached = true;
      }
    } catch {
      // Cache is optional
    }
  }

  const { text: answer } = await generateText(generateOptions);

  return {
    answer,
    sources: sourcesUsed,
    model: mode === 'deep' ? 'pro' : 'flash',
    cached,
  };
}
