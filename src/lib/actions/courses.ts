'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { deleteEmbeddingsBySource } from '@/lib/queries/embeddings';

export async function createCourse(data: {
  name: string;
  color: string;
  folder_id: string | null;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data: course, error } = await supabase
    .from('courses')
    .insert({
      user_id: user.id,
      name: data.name,
      color: data.color,
      folder_id: data.folder_id,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  revalidatePath('/dashboard');
  return course;
}

export async function updateCourse(
  id: string,
  data: {
    name?: string;
    color?: string;
  },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data: course, error } = await supabase
    .from('courses')
    .update({
      name: data.name,
      color: data.color,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  revalidatePath('/dashboard');
  return course;
}

export async function deleteCourse(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // Authorize: only the owner may delete.
  const { data: course } = await supabase
    .from('courses')
    .select('user_id')
    .eq('id', id)
    .maybeSingle();
  if (!course || course.user_id !== user.id) {
    throw new Error('Only the course owner can delete this course');
  }

  // Admin client: contributors' files/objects live under their own user
  // prefix, unreachable via the owner's per-user storage RLS.
  const admin = createAdminClient();

  const [{ data: materials }, { data: files }] = await Promise.all([
    admin
      .from('course_materials')
      .select('id, storage_path')
      .eq('course_id', id),
    admin.from('personal_files').select('id, storage_path').eq('course_id', id),
  ]);

  // Embeddings do not cascade (content_embeddings.course_id FK was dropped).
  for (const m of materials ?? [])
    await deleteEmbeddingsBySource('course_material', m.id);
  for (const f of files ?? [])
    await deleteEmbeddingsBySource('personal_file', f.id);

  const matPaths = (materials ?? []).map((m) => m.storage_path);
  const pfPaths = (files ?? []).map((f) => f.storage_path);
  if (matPaths.length)
    await admin.storage.from('course-materials').remove(matPaths);
  if (pfPaths.length)
    await admin.storage.from('personal-files').remove(pfPaths);

  // Delete the course row. DB cascades members, share links, materials,
  // personal_files, homework_sessions, ai_conversations; documents.course_id
  // is set null (members' notes survive as unfiled).
  const { error } = await admin.from('courses').delete().eq('id', id);
  if (error) throw new Error(error.message);

  revalidatePath('/dashboard');
}

export async function moveCourse(id: string, folder_id: string | null) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('courses')
    .update({
      folder_id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('user_id', user.id);
  if (error) throw new Error(error.message);
  revalidatePath('/dashboard');
}
