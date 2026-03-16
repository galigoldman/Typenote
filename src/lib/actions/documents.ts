'use server';

import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';

export async function createDocument(data: {
  title: string;
  subject: string;
  subject_custom?: string;
  canvas_type: string;
  folder_id: string | null;
  course_id?: string | null;
  week_id?: string | null;
  purpose?: 'homework' | 'summary' | 'notes' | null;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data: doc, error } = await supabase
    .from('documents')
    .insert({
      user_id: user.id,
      ...data,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  revalidatePath('/dashboard');
  return doc;
}

export async function updateDocument(
  id: string,
  data: {
    title?: string;
    subject?: string;
    subject_custom?: string | null;
    canvas_type?: string;
    content?: Record<string, unknown>;
  },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data: doc, error } = await supabase
    .from('documents')
    .update(data)
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  revalidatePath('/dashboard');
  return doc;
}

export async function deleteDocument(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('documents')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) throw new Error(error.message);
  revalidatePath('/dashboard');
}

export async function moveDocument(id: string, folderId: string | null) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data: doc, error } = await supabase
    .from('documents')
    .update({ folder_id: folderId })
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  revalidatePath('/dashboard');
  return doc;
}

export async function updateDocumentContent(
  id: string,
  contentJson: string,
  pages?: Record<string, unknown>,
): Promise<{ updated_at: string }> {
  const content = JSON.parse(contentJson);
  const supabase = await createClient();
  const updateData: Record<string, unknown> = { content };
  if (pages !== undefined) {
    updateData.pages = pages;
  }
  const { data, error } = await supabase
    .from('documents')
    .update(updateData)
    .eq('id', id)
    .select('updated_at')
    .single();
  if (error) throw new Error(error.message);
  return { updated_at: data.updated_at };
}

export async function updateDocumentTitle(
  id: string,
  title: string,
): Promise<{ updated_at: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('documents')
    .update({ title })
    .eq('id', id)
    .select('updated_at')
    .single();
  if (error) throw new Error(error.message);
  return { updated_at: data.updated_at };
}

export async function openMaterialAsDocument(
  materialId: string,
  pageCount: number,
): Promise<{ documentId: string; created: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // Fetch material and verify ownership
  const { data: material, error: matError } = await supabase
    .from('course_materials')
    .select('id, week_id, file_name, user_id')
    .eq('id', materialId)
    .single();

  if (matError || !material) throw new Error('Material not found');
  if (material.user_id !== user.id) throw new Error('Material not found');
  if (pageCount < 1 || pageCount > 500) throw new Error('Invalid page count');

  // Check for existing document linked to this material
  const { data: existing } = await supabase
    .from('documents')
    .select('id')
    .eq('material_id', materialId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (existing) {
    return { documentId: existing.id, created: false };
  }

  // Resolve course_id from the week
  const { data: week } = await supabase
    .from('course_weeks')
    .select('course_id')
    .eq('id', material.week_id)
    .single();

  // Generate pages — one per PDF page
  const pages = Array.from({ length: pageCount }, (_, i) => ({
    id: Math.random().toString(36).slice(2) + Date.now().toString(36),
    order: i,
    pdfPage: i,
    strokes: [],
    textBoxes: [],
    flowContent: null,
  }));

  // Strip file extension for title
  const title = material.file_name.replace(/\.[^.]+$/, '');

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
      course_id: week?.course_id ?? null,
      week_id: material.week_id,
      material_id: materialId,
      position: 0,
    })
    .select('id')
    .single();

  if (error) throw new Error('Failed to open material');

  revalidatePath('/dashboard');
  return { documentId: doc.id, created: true };
}

export async function createWeekDocument(data: {
  course_id: string;
  week_id: string;
  week_number: number;
  purpose: 'homework' | 'summary' | 'notes';
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // Auto-generate title based on purpose
  const purposeTitles: Record<string, string> = {
    homework: 'Homework',
    summary: 'Summary',
    notes: 'Notes',
  };
  const title = `Week ${data.week_number} — ${purposeTitles[data.purpose]}`;

  const { data: document, error } = await supabase
    .from('documents')
    .insert({
      user_id: user.id,
      title,
      content: {},
      subject: 'general',
      canvas_type: 'blank',
      folder_id: null,
      course_id: data.course_id,
      week_id: data.week_id,
      purpose: data.purpose,
      position: 0,
    })
    .select()
    .single();

  if (error) throw error;

  revalidatePath('/dashboard');
  return document;
}
