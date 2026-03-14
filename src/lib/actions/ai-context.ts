'use server';

import crypto from 'crypto';

import { GoogleGenAI } from '@google/genai';

import { embedFileSegments, embedQuery, embedText } from '@/lib/ai/embeddings';
import { extractDocxText } from '@/lib/ai/extraction/docx';
import { SYSTEM_PROMPT } from '@/lib/ai/prompts';
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
      // Multimodal embedding with Gemini Embedding 2.
      // PDFs are split into 6-page chunks, each embedded separately.
      const segments = await embedFileSegments(fileBuffer, mimeType);

      if (!segments.length) {
        return { success: true, segmentsIndexed: 0, skipped: true };
      }

      for (let i = 0; i < segments.length; i++) {
        rows.push({
          source_type: sourceType,
          source_id: sourceId,
          segment_index: i,
          page_start: segments[i].pageStart,
          page_end: segments[i].pageEnd,
          segment_text: null,
          embedding: segments[i].embedding,
          user_id: userId,
          course_id: courseId,
          week_id: weekId,
          source_name: sourceName,
          mime_type: mimeType,
          content_hash: hash,
        });
      }
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
    // ----- RAG-only mode: search + download matched files -----
    const results = await searchContext({
      query: question,
      courseId,
      maxResults: 8,
    });
    // Download actual files for matched results so the LLM can read them
    const seen = new Set<string>();
    const admin = createAdminClient();
    for (const r of results) {
      if (seen.has(r.sourceId)) continue;
      seen.add(r.sourceId);

      try {
        const table = r.sourceType === 'moodle_file' ? 'moodle_files' : 'course_materials';
        const { data: fileRow } = await admin
          .from(table)
          .select('storage_path, mime_type')
          .eq('id', r.sourceId)
          .single();

        if (fileRow?.storage_path) {
          const isMoodleRef = fileRow.storage_path.startsWith('moodle:');
          const bucket = r.sourceType === 'moodle_file' || isMoodleRef ? 'moodle-materials' : 'course-materials';
          const storagePath = isMoodleRef ? fileRow.storage_path.slice(7) : fileRow.storage_path;

          const { data: fileData } = await admin.storage.from(bucket).download(storagePath);
          if (fileData) {
            const buffer = Buffer.from(await fileData.arrayBuffer());
            fileParts.push({
              type: 'file',
              data: buffer,
              mimeType: fileRow.mime_type ?? 'application/pdf',
            });
            // Only add to sources if we actually got the file
            sourcesUsed.push({
              sourceType: r.sourceType,
              sourceName: r.sourceName,
              weekId: r.weekId,
              pageRange: r.pageStart && r.pageEnd ? `pages ${r.pageStart}-${r.pageEnd}` : null,
            });
          }
        }
      } catch (err) {
        console.error(`Failed to download ${r.sourceName}:`, err);
      }
    }
  }

  // Build multi-turn contents for Gemini
  const genai = new GoogleGenAI({
    apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? '',
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contents: Array<{ role: string; parts: any[] }> = [];

  if (fileParts.length > 0) {
    // Turn 1: User sends files + context instruction
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fileContentParts: any[] = fileParts.map((fp) => ({
      inlineData: {
        mimeType: fp.mimeType,
        data: fp.data.toString('base64'),
      },
    }));
    fileContentParts.push({
      text: 'I have attached course materials. Review them to answer my questions.',
    });
    contents.push({ role: 'user', parts: fileContentParts });

    // Turn 2: Model acknowledges
    contents.push({
      role: 'model',
      parts: [{ text: 'I have reviewed the course materials. Please ask your question.' }],
    });
  }

  // Add conversation history as alternating turns
  // Gemini requires strict role alternation (user/model/user/model).
  // Guard: merge consecutive same-role messages to avoid API errors.
  if (conversationHistory?.length) {
    for (const msg of conversationHistory) {
      const role = msg.role === 'user' ? 'user' : 'model';
      const lastTurn = contents[contents.length - 1];
      if (lastTurn && lastTurn.role === role) {
        // Merge into previous turn to maintain alternation
        lastTurn.parts.push({ text: msg.content });
      } else {
        contents.push({ role, parts: [{ text: msg.content }] });
      }
    }
  }

  // Final turn: the actual question
  if (fileParts.length === 0) {
    contents.push({
      role: 'user',
      parts: [{ text: `${question}\n\n(No course materials were loaded. Say you cannot answer without materials.)` }],
    });
  } else {
    // Guard: if last turn is already 'user' (from history), merge question into it
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

  // Note: Context caching is deferred — context-cache.ts only supports text content,
  // not multimodal PDF inlineData. Caching multimodal content requires updating the
  // cache module to pass inlineData parts instead of text. Tracked as follow-up.

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
