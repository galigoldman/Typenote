'use server';

import crypto from 'crypto';

import { GoogleGenAI } from '@google/genai';

import { chunkText, embedQuery, embedText } from '@/lib/ai/embeddings';
import { extractDocxText } from '@/lib/ai/extraction/docx';
import { extractPdfText } from '@/lib/ai/extraction/pdf';
import { buildSystemPrompt } from '@/lib/ai/prompts';
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
  courseId?: string;
  weekId?: string;
  documentId?: string;
  mode: 'quick' | 'deep';
  courseName?: string;
  weekLabel?: string;
  documentContent?: string;
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
  imageData?: string;
};

export type QuestionResult = {
  answer: string;
  sources: Array<{
    sourceType: string;
    sourceName: string;
    weekId: string | null;
    pageRange: string | null;
    signedUrl: string | null;
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
        .select('storage_path, file_name, mime_type, section_id')
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

      // Look up canonical moodle_courses.id via the section. This is the file's
      // upstream home and stays stable across users — using it on the embedding
      // row makes the same file findable for everyone who imports it.
      const { data: sectionRow, error: sectionErr } = await admin
        .from('moodle_sections')
        .select('course_id')
        .eq('id', fileRow.section_id)
        .single();

      if (sectionErr || !sectionRow?.course_id) {
        return {
          success: false,
          segmentsIndexed: 0,
          skipped: false,
          error: 'Moodle section not found for file',
        };
      }

      courseId = sectionRow.course_id;
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
  const supabase = await createClient();
  const queryEmbedding = await embedQuery(params.query);

  // Resolve Typenote course -> canonical moodle_courses.id (if synced).
  // RLS restricts user_course_syncs to the caller, so no user_id filter
  // needed here.
  let moodleCourseId: string | null = null;
  let importedMoodleFileIds: string[] | null = null;
  if (params.courseId) {
    const { data: sync } = await supabase
      .from('user_course_syncs')
      .select('id, moodle_course_id')
      .eq('course_id', params.courseId)
      .maybeSingle();
    const syncRow = sync as {
      id: string;
      moodle_course_id: string | null;
    } | null;
    moodleCourseId = syncRow?.moodle_course_id ?? null;
    const syncId = syncRow?.id ?? null;

    if (moodleCourseId && syncId) {
      // Fetch the user's notebook for THIS course — files they imported
      // into the current sync, not every file they ever imported across
      // every course. The SQL function also re-filters by
      // ce.course_id = match_moodle_course_id, but scoping here keeps
      // the allowlist tight and avoids dragging unrelated file ids
      // across the wire.
      const { data: imports } = await supabase
        .from('user_file_imports')
        .select('moodle_file_id')
        .eq('sync_id', syncId)
        .eq('status', 'imported');
      importedMoodleFileIds = (
        (imports as { moodle_file_id: string }[] | null) ?? []
      ).map((i) => i.moodle_file_id);
    }
  }

  const matches: MatchResult[] = await matchEmbeddings({
    queryEmbedding,
    userId,
    courseId: params.courseId,
    moodleCourseId,
    importedMoodleFileIds,
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
    courseId: params.courseId ?? '',
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
  const {
    question,
    courseId,
    mode,
    courseName,
    weekLabel,
    documentContent,
    conversationHistory,
  } = params;

  // Build dynamic system prompt with course/week context
  const hasDocumentContent = !!documentContent?.trim();
  const systemPrompt = buildSystemPrompt({
    courseName,
    weekLabel,
    hasDocumentContent,
  });

  // RAG search — find relevant text chunks (skip when no course)
  const results = courseId
    ? await searchContext({
        query: question,
        courseId,
        maxResults: 8,
      })
    : [];

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
        signedUrl: null,
      });
    }
  }

  // Build multi-turn contents for Gemini
  const genai = new GoogleGenAI({
    apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? '',
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contents: Array<{ role: string; parts: any[] }> = [];

  // Inject student's document content as first turn (if provided)
  const MAX_DOC_CHARS = 50_000;
  if (hasDocumentContent) {
    const truncated =
      documentContent!.length > MAX_DOC_CHARS
        ? documentContent!.slice(0, MAX_DOC_CHARS) + '\n\n[...truncated]'
        : documentContent!;
    contents.push({
      role: 'user',
      parts: [
        {
          text: `Here is the student's current document:\n\n${truncated}\n\nReview it to understand their work.`,
        },
      ],
    });
    contents.push({
      role: 'model',
      parts: [
        {
          text: "I have reviewed the student's document. I can see their notes and work.",
        },
      ],
    });
  }

  if (contextTexts.length > 0) {
    // Provide course materials as text
    const materialsText = contextTexts.join('\n\n');
    contents.push({
      role: 'user',
      parts: [
        {
          text: `Here are the relevant course materials:\n\n${materialsText}\n\nReview them to answer my questions.`,
        },
      ],
    });

    // Model acknowledges
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
      systemInstruction: systemPrompt,
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
// buildAiContext — shared context builder for both streaming and non-streaming
// ---------------------------------------------------------------------------

export async function buildAiContext(params: QuestionParams): Promise<{
  systemPrompt: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  contents: Array<{ role: string; parts: any[] }>;
  modelName: string;
  sources: QuestionResult['sources'];
}> {
  await getAuthUserId();
  const supabase = await createClient();
  const {
    question,
    courseId,
    mode,
    courseName,
    weekLabel,
    documentContent,
    conversationHistory,
  } = params;

  const hasDocumentContent = !!documentContent?.trim();
  const systemPrompt = buildSystemPrompt({
    courseName,
    weekLabel,
    hasDocumentContent,
  });

  // Skip RAG search when there's no course (no materials to search)
  const results = courseId
    ? await searchContext({
        query: question,
        courseId,
        maxResults: 8,
      })
    : [];

  const contextTexts: string[] = [];
  const sources: QuestionResult['sources'] = [];
  const sourceIds: { sourceId: string; sourceType: string; idx: number }[] = [];
  const seen = new Set<string>();

  for (const r of results) {
    if (r.segmentText && !seen.has(r.sourceId)) {
      seen.add(r.sourceId);
      contextTexts.push(`--- ${r.sourceName} ---\n${r.segmentText}`);
      sources.push({
        sourceType: r.sourceType,
        sourceName: r.sourceName,
        weekId: r.weekId,
        pageRange: null,
        signedUrl: null, // populated by the URL-attach block below
      });
      sourceIds.push({
        sourceId: r.sourceId,
        sourceType: r.sourceType,
        idx: sources.length - 1,
      });
    }
  }

  // Batch-fetch storage paths per source type, then generate signed URLs
  // in parallel. If anything fails, leave signedUrl null — the chat
  // falls back to a non-clickable badge.
  const moodleIds = sourceIds
    .filter((s) => s.sourceType === 'moodle_file')
    .map((s) => s.sourceId);
  const materialIds = sourceIds
    .filter((s) => s.sourceType === 'course_material')
    .map((s) => s.sourceId);

  const admin = createAdminClient();
  const moodlePaths: Record<string, string> = {};
  const materialPaths: Record<string, string> = {};

  if (moodleIds.length > 0) {
    const { data } = await admin
      .from('moodle_files')
      .select('id, storage_path')
      .in('id', moodleIds);
    for (const row of (data ?? []) as {
      id: string;
      storage_path: string | null;
    }[]) {
      if (row.storage_path) moodlePaths[row.id] = row.storage_path;
    }
  }
  if (materialIds.length > 0) {
    const { data } = await supabase
      .from('course_materials')
      .select('id, storage_path')
      .in('id', materialIds);
    for (const row of (data ?? []) as { id: string; storage_path: string }[]) {
      materialPaths[row.id] = row.storage_path;
    }
  }

  await Promise.all(
    sourceIds.map(async ({ sourceId, sourceType, idx }) => {
      const bucket =
        sourceType === 'moodle_file'
          ? 'moodle-materials'
          : sourceType === 'course_material'
            ? 'course-materials'
            : null;
      const path =
        sourceType === 'moodle_file'
          ? moodlePaths[sourceId]
          : sourceType === 'course_material'
            ? materialPaths[sourceId]
            : null;
      if (!bucket || !path) return;
      const client = bucket === 'moodle-materials' ? admin : supabase;
      const { data } = await client.storage
        .from(bucket)
        .createSignedUrl(path, 3600);
      sources[idx].signedUrl = data?.signedUrl ?? null;
    }),
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contents: Array<{ role: string; parts: any[] }> = [];

  const MAX_DOC_CHARS = 50_000;
  if (hasDocumentContent) {
    const truncated =
      documentContent!.length > MAX_DOC_CHARS
        ? documentContent!.slice(0, MAX_DOC_CHARS) + '\n\n[...truncated]'
        : documentContent!;
    contents.push({
      role: 'user',
      parts: [
        {
          text: `Here is the student's current document:\n\n${truncated}\n\nReview it to understand their work.`,
        },
      ],
    });
    contents.push({
      role: 'model',
      parts: [
        {
          text: "I have reviewed the student's document. I can see their notes and work.",
        },
      ],
    });
  }

  if (contextTexts.length > 0) {
    const materialsText = contextTexts.join('\n\n');
    contents.push({
      role: 'user',
      parts: [
        {
          text: `Here are the relevant course materials:\n\n${materialsText}\n\nReview them to answer my questions.`,
        },
      ],
    });
    contents.push({
      role: 'model',
      parts: [
        {
          text: 'I have reviewed the course materials. Please ask your question.',
        },
      ],
    });
  }

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

  // Build the user's question parts (optionally with image)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const questionParts: any[] = [];

  if (params.imageData) {
    // Multimodal: include image as inline data for Gemini
    questionParts.push({
      inlineData: { mimeType: 'image/png', data: params.imageData },
    });
    questionParts.push({
      text: `The student has shared a screenshot from their course material. Analyze the visual content and reference it in your response.\n\n${question}`,
    });
  } else if (contextTexts.length === 0 && !hasDocumentContent) {
    questionParts.push({
      text: `${question}\n\n(No course materials were loaded. Answer using your own knowledge but note that no materials were found.)`,
    });
  } else {
    questionParts.push({ text: question });
  }

  // Append question parts to contents (merging if last turn is also 'user')
  if (params.imageData || (contextTexts.length === 0 && !hasDocumentContent)) {
    // Always create a new user turn for image queries or no-context queries
    contents.push({ role: 'user', parts: questionParts });
  } else {
    const lastTurn = contents[contents.length - 1];
    if (lastTurn && lastTurn.role === 'user') {
      lastTurn.parts.push(...questionParts);
    } else {
      contents.push({ role: 'user', parts: questionParts });
    }
  }

  const modelName = mode === 'deep' ? 'gemini-2.5-pro' : 'gemini-2.5-flash';

  return { systemPrompt, contents, modelName, sources };
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
