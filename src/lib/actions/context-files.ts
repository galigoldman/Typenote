'use server';

import { revalidatePath } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  resolveContextFileName,
  resolveContextFileMeta,
} from '@/lib/ai/context-files';
import type {
  AttachableFile,
  ContextFileType,
  DocumentContextFile,
  ResolvedContextFile,
} from '@/types/database';

const FILE_TYPES: ContextFileType[] = [
  'course_material',
  'personal_file',
  'moodle_file',
];

/** Pure loader (testable): rows for a document. */
export async function listContextFiles(
  supabase: SupabaseClient,
  documentId: string,
): Promise<DocumentContextFile[]> {
  const { data } = await supabase
    .from('document_context_files')
    .select('*')
    .eq('document_id', documentId);
  return (data as DocumentContextFile[] | null) ?? [];
}

async function assertOwnsCourseDoc(
  supabase: SupabaseClient,
  documentId: string,
) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  const { data: doc } = await supabase
    .from('documents')
    .select('id, course_id, user_id')
    .eq('id', documentId)
    .single();
  if (!doc || doc.user_id !== user.id) throw new Error('Document not found');
  if (!doc.course_id) throw new Error('Document is not in a course');
  return { user, courseId: doc.course_id as string };
}

export async function attachContextFile(data: {
  documentId: string;
  fileType: ContextFileType;
  fileId: string;
}): Promise<ResolvedContextFile> {
  if (!FILE_TYPES.includes(data.fileType)) throw new Error('Invalid file type');
  const supabase = await createClient();
  const admin = createAdminClient();
  await assertOwnsCourseDoc(supabase, data.documentId);

  const meta = await resolveContextFileMeta(
    supabase,
    admin,
    data.fileType,
    data.fileId,
  );
  if (!meta) throw new Error('File not found');

  const { error } = await supabase.from('document_context_files').insert({
    document_id: data.documentId,
    file_type: data.fileType,
    file_id: data.fileId,
  });
  // Ignore unique-violation (already attached); rethrow anything else.
  if (error && error.code !== '23505') throw new Error(error.message);

  revalidatePath(`/dashboard/documents/${data.documentId}`);
  return {
    fileType: data.fileType,
    fileId: data.fileId,
    name: meta.name,
    mimeType: meta.mimeType,
  };
}

export async function detachContextFile(data: {
  documentId: string;
  fileType: ContextFileType;
  fileId: string;
}): Promise<void> {
  const supabase = await createClient();
  await assertOwnsCourseDoc(supabase, data.documentId);
  const { error } = await supabase
    .from('document_context_files')
    .delete()
    .eq('document_id', data.documentId)
    .eq('file_type', data.fileType)
    .eq('file_id', data.fileId);
  if (error) throw new Error(error.message);
  revalidatePath(`/dashboard/documents/${data.documentId}`);
}

/** Attached files resolved for display in the panel. */
export async function getContextFiles(
  documentId: string,
): Promise<ResolvedContextFile[]> {
  const supabase = await createClient();
  const admin = createAdminClient();
  const rows = await listContextFiles(supabase, documentId);
  const resolved = await Promise.all(
    rows.map(async (r) => {
      const meta = await resolveContextFileMeta(
        supabase,
        admin,
        r.file_type,
        r.file_id,
      );
      return meta
        ? {
            fileType: r.file_type,
            fileId: r.file_id,
            name: meta.name,
            mimeType: meta.mimeType,
          }
        : null;
    }),
  );
  return resolved.filter((r): r is ResolvedContextFile => !!r);
}

/** A short-lived signed URL for viewing an attached file. */
export async function getContextFileUrl(data: {
  fileType: ContextFileType;
  fileId: string;
}): Promise<{ url: string; mimeType: string | null } | null> {
  const supabase = await createClient();
  const admin = createAdminClient();
  const meta = await resolveContextFileMeta(
    supabase,
    admin,
    data.fileType,
    data.fileId,
  );
  if (!meta?.storagePath) return null;
  const client = meta.bucket === 'moodle-materials' ? admin : supabase;
  const { data: signed } = await client.storage
    .from(meta.bucket)
    .createSignedUrl(meta.storagePath, 3600);
  if (!signed?.signedUrl) return null;
  return { url: signed.signedUrl, mimeType: meta.mimeType };
}

/** Candidate files for the add-picker: course materials + personal files + imported Moodle files. */
export async function getAttachableFiles(courseId: string): Promise<{
  courseMaterials: AttachableFile[];
  personalFiles: AttachableFile[];
  moodleFiles: AttachableFile[];
}> {
  const supabase = await createClient();
  const admin = createAdminClient();

  const [{ data: cms }, { data: pfs }] = await Promise.all([
    supabase
      .from('course_materials')
      .select('id, file_name, mime_type')
      .eq('course_id', courseId),
    supabase
      .from('personal_files')
      .select('id, display_name, mime_type')
      .eq('course_id', courseId),
  ]);

  // Imported Moodle files for this course (mirror searchContext's resolution).
  const moodleFiles: AttachableFile[] = [];
  const { data: sync } = await supabase
    .from('user_course_syncs')
    .select('id, moodle_course_id')
    .eq('course_id', courseId)
    .maybeSingle();
  if (sync?.id) {
    const { data: imports } = await supabase
      .from('user_file_imports')
      .select('moodle_file_id')
      .eq('sync_id', sync.id)
      .eq('status', 'imported');
    const ids = ((imports as { moodle_file_id: string }[] | null) ?? []).map(
      (i) => i.moodle_file_id,
    );
    if (ids.length) {
      const { data: mfs } = await admin
        .from('moodle_files')
        .select('id, file_name, mime_type')
        .in('id', ids)
        .eq('is_removed', false)
        .eq('type', 'file');
      for (const m of (mfs as
        | { id: string; file_name: string; mime_type: string | null }[]
        | null) ?? []) {
        moodleFiles.push({
          fileType: 'moodle_file',
          fileId: m.id,
          name: m.file_name,
          mimeType: m.mime_type,
        });
      }
    }
  }

  return {
    courseMaterials: (
      (cms as
        | { id: string; file_name: string; mime_type: string | null }[]
        | null) ?? []
    ).map((m) => ({
      fileType: 'course_material',
      fileId: m.id,
      name: m.file_name,
      mimeType: m.mime_type,
    })),
    personalFiles: (
      (pfs as
        | { id: string; display_name: string; mime_type: string | null }[]
        | null) ?? []
    ).map((f) => ({
      fileType: 'personal_file',
      fileId: f.id,
      name: f.display_name,
      mimeType: f.mime_type,
    })),
    moodleFiles,
  };
}
