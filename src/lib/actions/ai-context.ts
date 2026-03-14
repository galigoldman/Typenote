'use server';

import crypto from 'crypto';

import { GoogleGenAI } from '@google/genai';

import { chunkText, embedQuery, embedText } from '@/lib/ai/embeddings';
import { extractDocxText } from '@/lib/ai/extraction/docx';
import { extractPdfText } from '@/lib/ai/extraction/pdf';
import { SYSTEM_PROMPT } from '@/lib/ai/prompts';
import {
  getContentHash,
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
  | {
      type: 'course_material';
      materialId: string;
      courseId: string;
      weekId: string;
    };

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
  segmentText: string | null;
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

// ---------------------------------------------------------------------------
// indexContent — extract text, embed as text, store in segment_text
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
        return {
          success: false,
          segmentsIndexed: 0,
          skipped: false,
          error: 'Moodle file not found or no storage path',
        };
      }

      sourceName = fileRow.file_name;
      mimeType = fileRow.mime_type ?? 'application/octet-stream';
      storageBucket = 'moodle-materials';

      const { data: fileData, error: dlErr } = await admin.storage
        .from(storageBucket)
        .download(fileRow.storage_path);

      if (dlErr || !fileData) {
        return {
          success: false,
          segmentsIndexed: 0,
          skipped: false,
          error: 'Failed to download moodle file',
        };
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
        return {
          success: false,
          segmentsIndexed: 0,
          skipped: false,
          error: 'Course material not found',
        };
      }

      sourceName = matRow.file_name;
      mimeType = matRow.mime_type ?? 'application/octet-stream';
      storageBucket = 'course-materials';

      const { data: fileData, error: dlErr } = await supabase.storage
        .from(storageBucket)
        .download(matRow.storage_path);

      if (dlErr || !fileData) {
        return {
          success: false,
          segmentsIndexed: 0,
          skipped: false,
          error: 'Failed to download course material',
        };
      }

      fileBuffer = Buffer.from(await fileData.arrayBuffer());
    }

    // Check content hash — skip if unchanged
    const hash = sha256(fileBuffer);
    const existingHash = await getContentHash(sourceType, sourceId);
    if (existingHash === hash) {
      return { success: true, segmentsIndexed: 0, skipped: true };
    }

    // Extract text from file
    let text = '';
    if (
      mimeType === 'application/pdf' ||
      mimeType.includes('presentationml') ||
      mimeType.includes('powerpoint')
    ) {
      text = await extractPdfText(fileBuffer);
    } else if (
      mimeType.includes('wordprocessingml') ||
      mimeType === 'application/msword'
    ) {
      text = await extractDocxText(fileBuffer);
    } else {
      return {
        success: false,
        segmentsIndexed: 0,
        skipped: false,
        error: `Unsupported mime type: ${mimeType}`,
      };
    }

    if (!text.trim()) {
      return { success: true, segmentsIndexed: 0, skipped: true };
    }

    // Chunk text if too large, then embed each chunk
    const chunks = chunkText(text);
    const rows: EmbeddingRow[] = [];

    for (const chunk of chunks) {
      const embedding = await embedText(chunk.text);
      if (!embedding.length) continue;

      rows.push({
        source_type: sourceType,
        source_id: sourceId,
        segment_index: chunk.chunkIndex,
        page_start: null,
        page_end: null,
        segment_text: chunk.text,
        embedding,
        user_id: userId,
        course_id: courseId,
        week_id: weekId,
        source_name: sourceName,
        mime_type: mimeType,
        content_hash: hash,
      });
    }

    if (!rows.length) {
      return { success: true, segmentsIndexed: 0, skipped: true };
    }

    await upsertEmbeddings(rows);

    return { success: true, segmentsIndexed: rows.length, skipped: false };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('indexContent error:', message);
    return {
      success: false,
      segmentsIndexed: 0,
      skipped: false,
      error: message,
    };
  }
}

// ---------------------------------------------------------------------------
// searchContext — semantic search returning matched text chunks
// ---------------------------------------------------------------------------

export async function searchContext(
  params: SearchParams,
): Promise<SearchResult[]> {
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
    segmentText: m.segment_text,
    pageStart: m.page_start,
    pageEnd: m.page_end,
    courseId: params.courseId,
    weekId: m.week_id,
    mimeType: m.mime_type,
    similarity: m.similarity,
  }));
}

// ---------------------------------------------------------------------------
// askQuestion — uses stored text from search results (no file downloads)
// ---------------------------------------------------------------------------

export async function askQuestion(
  params: QuestionParams,
): Promise<QuestionResult> {
  await getAuthUserId(); // validate auth
  const { question, courseId, mode, conversationHistory } = params;

  // RAG search — find relevant text chunks
  const results = await searchContext({
    query: question,
    courseId,
    maxResults: 8,
  });

  // Collect text context and sources from search results
  const contextTexts: string[] = [];
  const sourcesUsed: QuestionResult['sources'] = [];
  const seen = new Set<string>();

  for (const r of results) {
    if (r.segmentText && !seen.has(r.sourceId)) {
      seen.add(r.sourceId);
      contextTexts.push(`--- ${r.sourceName} ---\n${r.segmentText}`);
      sourcesUsed.push({
        sourceType: r.sourceType,
        sourceName: r.sourceName,
        weekId: r.weekId,
        pageRange: null,
      });
    }
  }

  // Build multi-turn contents for Gemini
  const genai = new GoogleGenAI({
    apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? '',
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contents: Array<{ role: string; parts: any[] }> = [];

  if (contextTexts.length > 0) {
    // Turn 1: User provides course materials as text
    const materialsText = contextTexts.join('\n\n');
    contents.push({
      role: 'user',
      parts: [
        {
          text: `Here are the relevant course materials:\n\n${materialsText}\n\nReview them to answer my questions.`,
        },
      ],
    });

    // Turn 2: Model acknowledges
    contents.push({
      role: 'model',
      parts: [
        {
          text: 'I have reviewed the course materials. Please ask your question.',
        },
      ],
    });
  }

  // Add conversation history with role-alternation guard
  if (conversationHistory?.length) {
    for (const msg of conversationHistory) {
      const role = msg.role === 'user' ? 'user' : 'model';
      const lastTurn = contents[contents.length - 1];
      if (lastTurn && lastTurn.role === role) {
        lastTurn.parts.push({ text: msg.content });
      } else {
        contents.push({ role, parts: [{ text: msg.content }] });
      }
    }
  }

  // Final turn: the actual question
  if (contextTexts.length === 0) {
    contents.push({
      role: 'user',
      parts: [
        {
          text: `${question}\n\n(No course materials were loaded. Say you cannot answer without materials.)`,
        },
      ],
    });
  } else {
    const lastTurn = contents[contents.length - 1];
    if (lastTurn && lastTurn.role === 'user') {
      lastTurn.parts.push({ text: question });
    } else {
      contents.push({
        role: 'user',
        parts: [{ text: question }],
      });
    }
  }

  const modelName = mode === 'deep' ? 'gemini-2.5-pro' : 'gemini-2.5-flash';

  const result = await genai.models.generateContent({
    model: modelName,
    contents,
    config: {
      systemInstruction: SYSTEM_PROMPT,
    },
  });

  const answer = result.text ?? 'No response generated.';

  return {
    answer,
    sources: sourcesUsed,
    model: mode === 'deep' ? 'pro' : 'flash',
    cached: false,
  };
}

// ---------------------------------------------------------------------------
// reindexCourse — clear content hashes to force re-embedding on next sync
// ---------------------------------------------------------------------------

export async function reindexCourse(
  courseId: string,
): Promise<{ cleared: number }> {
  await getAuthUserId();
  const admin = createAdminClient();

  const { data, error } = await admin
    .from('content_embeddings')
    .update({ content_hash: null })
    .eq('course_id', courseId)
    .select('id');

  if (error) throw new Error(`Failed to clear hashes: ${error.message}`);
  return { cleared: data?.length ?? 0 };
}
