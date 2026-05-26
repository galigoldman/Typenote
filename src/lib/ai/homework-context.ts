// ---------------------------------------------------------------------------
// Homework AI context resolver
//
// Pure (client-injected) builder of the "prioritized" tiers for a homework
// chat: the exercise text (Tier 1) and pinned-material texts (Tier 2). It does
// NOT touch auth — callers pass a user-scoped client (`supabase`) for the
// user's own content and an admin client (`admin`) for the shared Moodle
// registry. This keeps it unit-testable (mock clients) AND integration-testable
// (pass a real service-role client) — server actions that call auth cannot be
// tested in Vitest.
//
// Reuses extractDocumentText (ProseMirror JSON) and the PDF/DOCX extractors.
// ---------------------------------------------------------------------------

import type { SupabaseClient } from '@supabase/supabase-js';

import { extractDocxText } from '@/lib/ai/extraction/docx';
import { extractPdfText } from '@/lib/ai/extraction/pdf';
import { extractDocumentText } from '@/lib/ai/extract-document-text';
import type { HomeworkMaterialType } from '@/types/database';

/** Per-source verbatim cap (chars). Mirrors the doc-content limit style. */
export const MAX_HOMEWORK_SOURCE_CHARS = 15_000;
/** Max number of pinned materials injected verbatim (rest fall back to RAG). */
export const MAX_PINNED_MATERIALS = 5;
/** Total Tier-1 + Tier-2 budget; beyond it, text is dropped (RAG still covers it). */
export const MAX_HOMEWORK_TOTAL_CHARS = 60_000;

export interface HomeworkAiContext {
  exerciseName: string;
  exerciseText: string;
  pinned: Array<{ name: string; text: string }>;
  /** All pinned names (even those whose text was dropped) — for the system prompt. */
  pinnedNames: string[];
}

function cap(text: string, max: number): string {
  if (max <= 0) return '';
  return text.length > max ? text.slice(0, max) + '\n\n[...truncated]' : text;
}

function extractFileText(buffer: Buffer, mimeType: string): Promise<string> {
  if (
    mimeType === 'application/pdf' ||
    mimeType.includes('presentationml') ||
    mimeType.includes('powerpoint')
  ) {
    return extractPdfText(buffer);
  }
  if (
    mimeType.includes('wordprocessingml') ||
    mimeType === 'application/msword'
  ) {
    return extractDocxText(buffer);
  }
  return Promise.resolve('');
}

interface FileSourceConfig {
  table: string;
  client: SupabaseClient;
  bucket: string;
  nameCol: string;
}

/**
 * Storage/table config for the three file-backed homework source types.
 * `document` is intentionally excluded — it is not file-backed (its text comes
 * from ProseMirror JSON, not Storage).
 */
function fileSourceConfig(
  type: HomeworkMaterialType,
  supabase: SupabaseClient,
  admin: SupabaseClient,
): FileSourceConfig | null {
  switch (type) {
    case 'course_material':
      return {
        table: 'course_materials',
        client: supabase,
        bucket: 'course-materials',
        nameCol: 'file_name',
      };
    case 'personal_file':
      return {
        table: 'personal_files',
        client: supabase,
        bucket: 'personal-files',
        nameCol: 'display_name',
      };
    case 'moodle_file':
      return {
        table: 'moodle_files',
        client: admin,
        bucket: 'moodle-materials',
        nameCol: 'file_name',
      };
    default:
      return null;
  }
}

/**
 * Resolve the display name of any homework source (exercise or material) by
 * type — WITHOUT downloading file content. User-owned tables are read through
 * the user-scoped `supabase` client (RLS enforces access, so a denied/missing
 * row returns null); the shared Moodle registry is read through `admin`.
 * Never throws — returns null on any failure.
 */
export async function resolveHomeworkSourceName(
  supabase: SupabaseClient,
  admin: SupabaseClient,
  type: HomeworkMaterialType,
  id: string,
): Promise<string | null> {
  try {
    if (type === 'document') {
      const { data } = await supabase
        .from('documents')
        .select('title')
        .eq('id', id)
        .maybeSingle();
      return (data?.title as string | undefined) || null;
    }
    const cfg = fileSourceConfig(type, supabase, admin);
    if (!cfg) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = (await (cfg.client as any)
      .from(cfg.table)
      .select(cfg.nameCol)
      .eq('id', id)
      .maybeSingle()) as { data: Record<string, unknown> | null };
    if (!data) return null;
    return String(data[cfg.nameCol] ?? '') || null;
  } catch {
    return null;
  }
}

/** Resolve one pinned material to { name, text }. Never throws — degrades to ''. */
async function resolvePinnedMaterial(
  supabase: SupabaseClient,
  admin: SupabaseClient,
  type: HomeworkMaterialType,
  id: string,
): Promise<{ name: string; text: string } | null> {
  try {
    if (type === 'document') {
      const { data } = await supabase
        .from('documents')
        .select('title, content, pages')
        .eq('id', id)
        .maybeSingle();
      if (!data) return null;
      return {
        name: data.title ?? 'Document',
        text: extractDocumentText(data),
      };
    }

    const cfg = fileSourceConfig(type, supabase, admin);
    if (!cfg) return null;

    // Select all columns; cast via unknown to escape Supabase's strict generic
    // inference which cannot handle the table-name string from cfg.table.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: row } = (await (cfg.client as any)
      .from(cfg.table)
      .select('*')
      .eq('id', id)
      .maybeSingle()) as { data: Record<string, unknown> | null };
    if (!row) return null;

    const name = String(row[cfg.nameCol] ?? 'Material');
    const storagePath = (row.storage_path as string | null) ?? null;
    const mimeType =
      (row.mime_type as string | null) ?? 'application/octet-stream';
    if (!storagePath) return { name, text: '' };

    const { data: file, error } = await cfg.client.storage
      .from(cfg.bucket)
      .download(storagePath);
    if (error || !file) return { name, text: '' };

    const buffer = Buffer.from(await file.arrayBuffer());
    const text = await extractFileText(buffer, mimeType);
    return { name, text };
  } catch {
    // Any failure (missing storage object, parse error) degrades to no text;
    // the material is still reachable via Tier-3 RAG.
    return { name: 'Material', text: '' };
  }
}

/**
 * Build the homework context for `documentId`, or null if it is not a homework
 * document. Applies per-source cap, max-pinned-count, and a total budget;
 * names are always returned even when a source's text is dropped.
 */
export async function resolveHomeworkContext(
  supabase: SupabaseClient,
  admin: SupabaseClient,
  documentId: string,
): Promise<HomeworkAiContext | null> {
  const { data: session } = await supabase
    .from('homework_sessions')
    .select('id, exercise_document_id, exercise_type, exercise_id')
    .eq('document_id', documentId)
    .maybeSingle();
  if (!session) return null;

  // Tier 1 — exercise. The exercise is polymorphic: prefer the typed columns
  // and fall back to the legacy document FK for pre-feature / seeded rows.
  let exerciseName = 'Exercise';
  let exerciseText = '';
  const exerciseType = (session.exercise_type ??
    (session.exercise_document_id
      ? 'document'
      : null)) as HomeworkMaterialType | null;
  const exerciseId = (session.exercise_id ?? session.exercise_document_id) as
    | string
    | null;

  if (exerciseType && exerciseId) {
    if (exerciseType === 'document') {
      // Typed notes are NOT RAG-indexed → inject their text verbatim (Tier 1).
      const { data: ex } = await supabase
        .from('documents')
        .select('title, content, pages')
        .eq('id', exerciseId)
        .maybeSingle();
      if (ex) {
        exerciseName = ex.title ?? 'Exercise';
        exerciseText = cap(extractDocumentText(ex), MAX_HOMEWORK_SOURCE_CHARS);
      }
    } else {
      // Imported files are already embedded → reference by name only; their
      // content reaches the model through Tier-3 RAG (no verbatim dump).
      const name = await resolveHomeworkSourceName(
        supabase,
        admin,
        exerciseType,
        exerciseId,
      );
      if (name) exerciseName = name;
    }
  }

  // Tier 2 — pinned materials
  const { data: mats } = await supabase
    .from('homework_session_materials')
    .select('material_type, material_id')
    .eq('session_id', session.id);

  const pinned: Array<{ name: string; text: string }> = [];
  const pinnedNames: string[] = [];
  let budget = MAX_HOMEWORK_TOTAL_CHARS - exerciseText.length;

  for (const m of (mats ?? []).slice(0, MAX_PINNED_MATERIALS)) {
    const resolved = await resolvePinnedMaterial(
      supabase,
      admin,
      m.material_type as HomeworkMaterialType,
      m.material_id as string,
    );
    if (!resolved) continue;
    pinnedNames.push(resolved.name);
    const text = cap(
      resolved.text,
      Math.min(MAX_HOMEWORK_SOURCE_CHARS, budget),
    );
    budget -= text.length;
    pinned.push({ name: resolved.name, text });
  }

  return { exerciseName, exerciseText, pinned, pinnedNames };
}
