'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { deleteEmbeddingsBySource } from '@/lib/queries/embeddings';

export async function createPersonalFile(data: {
  courseId: string;
  category: 'material' | 'homework';
  fileName: string;
  mimeType: string;
  fileSize: number;
  storagePath: string;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // Strip file extension to derive display name
  const displayName = data.fileName.replace(/\.[^.]+$/, '');

  const { data: file, error } = await supabase
    .from('personal_files')
    .insert({
      user_id: user.id,
      course_id: data.courseId,
      category: data.category,
      file_name: data.fileName,
      display_name: displayName,
      mime_type: data.mimeType,
      file_size: data.fileSize,
      storage_path: data.storagePath,
    })
    .select('id')
    .single();

  if (error) throw new Error(error.message);

  const embeddable =
    data.mimeType === 'application/pdf' ||
    data.mimeType.includes('wordprocessingml') ||
    data.mimeType.includes('presentationml');
  if (embeddable) {
    const { indexContent } = await import('@/lib/actions/ai-context');
    void indexContent({
      type: 'personal_file',
      fileId: file.id,
      courseId: data.courseId,
    });
  }

  revalidatePath('/dashboard');
  return { id: file.id };
}

export async function openPersonalFileAsDocument(data: {
  fileId: string;
  pageCount?: number;
}): Promise<{ documentId: string; created: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // Fetch the personal file record
  const { data: file, error: fileError } = await supabase
    .from('personal_files')
    .select('*')
    .eq('id', data.fileId)
    .single();

  if (fileError || !file) throw new Error('Personal file not found');
  if (file.user_id !== user.id) throw new Error('Personal file not found');

  // Check for existing document linked to this personal file
  const { data: existing } = await supabase
    .from('documents')
    .select('id, pages')
    .eq('personal_file_id', data.fileId)
    .eq('user_id', user.id)
    .maybeSingle();

  // Strip file extension for document title
  const title = file.file_name.replace(/\.[^.]+$/, '');

  // Map file category to document purpose so homework files appear under "My Solutions"
  const purpose = file.category === 'homework' ? 'homework' : null;

  const isPdf = file.mime_type === 'application/pdf';
  const isDocx = file.mime_type.includes('wordprocessingml');

  if (isPdf) {
    // --- PDF path ---
    const pageCount = data.pageCount;
    if (!pageCount || pageCount < 1 || pageCount > 500) {
      throw new Error('Invalid page count');
    }

    if (existing) {
      // Merge pages if the PDF has more pages than existing document
      const existingPages: Record<string, unknown>[] =
        (existing.pages as { pages?: Record<string, unknown>[] })?.pages ?? [];
      if (existingPages.length < pageCount) {
        const newPages = [...existingPages];
        for (let i = existingPages.length; i < pageCount; i++) {
          newPages.push({
            id: Math.random().toString(36).slice(2) + Date.now().toString(36),
            order: i,
            pdfPage: i,
            strokes: [],
            textBoxes: [],
            flowContent: null,
          });
        }
        await supabase
          .from('documents')
          .update({ pages: { pages: newPages } })
          .eq('id', existing.id);
      }
      return { documentId: existing.id, created: false };
    }

    // Generate pages array — one per PDF page
    const pages = Array.from({ length: pageCount }, (_, i) => ({
      id: Math.random().toString(36).slice(2) + Date.now().toString(36),
      order: i,
      pdfPage: i,
      strokes: [],
      textBoxes: [],
      flowContent: null,
    }));

    const { data: doc, error } = await supabase
      .from('documents')
      .insert({
        user_id: user.id,
        title,
        content: {},
        pages: { pages },
        subject: 'other',
        canvas_type: 'blank',
        folder_id: null,
        course_id: file.course_id,
        purpose,
        personal_file_id: data.fileId,
        position: 0,
      })
      .select('id')
      .single();

    if (error) {
      // Unique constraint violation — document was created by a concurrent request
      const { data: retry } = await supabase
        .from('documents')
        .select('id')
        .eq('personal_file_id', data.fileId)
        .eq('user_id', user.id)
        .maybeSingle();
      if (retry) return { documentId: retry.id, created: false };
      throw new Error('Failed to open personal file');
    }

    revalidatePath('/dashboard');
    return { documentId: doc.id, created: true };
  } else if (isDocx) {
    // --- DOCX path ---
    if (existing) {
      return { documentId: existing.id, created: false };
    }

    // Download file from storage using admin client (bypasses RLS)
    const admin = createAdminClient();
    const { data: blob, error: downloadError } = await admin.storage
      .from('personal-files')
      .download(file.storage_path);

    if (downloadError || !blob) {
      throw new Error('Failed to download file for conversion');
    }

    // Convert DOCX to HTML
    const buffer = Buffer.from(await blob.arrayBuffer());
    const { convertDocxToHtml } = await import('@/lib/docx/convert');
    const { html } = await convertDocxToHtml(buffer);

    // Store HTML wrapped in a marker object — the TipTap editor will detect
    // content._html and use setContent(html) to parse it into TipTap JSON.
    // The first auto-save will overwrite this with proper TipTap JSON.
    const { data: doc, error } = await supabase
      .from('documents')
      .insert({
        user_id: user.id,
        title,
        content: { _html: html },
        pages: null,
        subject: 'other',
        canvas_type: 'blank',
        folder_id: null,
        course_id: file.course_id,
        purpose,
        personal_file_id: data.fileId,
        position: 0,
      })
      .select('id')
      .single();

    if (error) {
      // Unique constraint violation — document was created by a concurrent request
      const { data: retry } = await supabase
        .from('documents')
        .select('id')
        .eq('personal_file_id', data.fileId)
        .eq('user_id', user.id)
        .maybeSingle();
      if (retry) return { documentId: retry.id, created: false };
      throw new Error('Failed to open personal file');
    }

    revalidatePath('/dashboard');
    return { documentId: doc.id, created: true };
  } else {
    throw new Error(`Unsupported file type: ${file.mime_type}`);
  }
}

export async function deletePersonalFile(fileId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // Fetch file record (RLS ensures only own files are returned)
  const { data: file, error: fetchError } = await supabase
    .from('personal_files')
    .select('storage_path, course_id')
    .eq('id', fileId)
    .single();

  if (fetchError || !file) throw new Error('Personal file not found');

  // Delete embeddings before removing storage/row so orphaned vectors are cleaned up
  await deleteEmbeddingsBySource('personal_file', fileId);

  // Delete from storage
  const { error: storageError } = await supabase.storage
    .from('personal-files')
    .remove([file.storage_path]);
  if (storageError) throw new Error(storageError.message);

  // Delete from table (FK ON DELETE SET NULL handles documents.personal_file_id)
  const { error } = await supabase
    .from('personal_files')
    .delete()
    .eq('id', fileId);
  if (error) throw new Error(error.message);

  revalidatePath('/dashboard');
}
