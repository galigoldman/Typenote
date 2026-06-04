'use server';

import { randomBytes } from 'crypto';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { deleteEmbeddingsBySource } from '@/lib/queries/embeddings';

export type ShareRole = 'viewer' | 'contributor';

export interface MemberRow {
  user_id: string;
  role: ShareRole;
  display_name: string | null;
  email: string | null;
}

function newToken(): string {
  // URL-safe ~22 chars
  return randomBytes(16).toString('base64url');
}

async function authed() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  return { supabase, user };
}

export async function createOrUpdateShareLink(input: {
  courseId: string;
  role: ShareRole;
}): Promise<{ token: string }> {
  const { supabase } = await authed();
  // Reuse an existing active link for this role if present.
  const { data: existing } = await supabase
    .from('course_share_links')
    .select('token')
    .eq('course_id', input.courseId)
    .eq('role', input.role)
    .eq('is_active', true)
    .maybeSingle();
  if (existing?.token) return { token: existing.token };

  const token = newToken();
  const { error } = await supabase.from('course_share_links').insert({
    course_id: input.courseId,
    role: input.role,
    token,
  });
  if (error) throw new Error(error.message);
  revalidatePath('/dashboard/courses/' + input.courseId);
  return { token };
}

export async function deactivateShareLink(input: {
  courseId: string;
  role: ShareRole;
}): Promise<void> {
  const { supabase } = await authed();
  const { error } = await supabase
    .from('course_share_links')
    .update({ is_active: false })
    .eq('course_id', input.courseId)
    .eq('role', input.role)
    .eq('is_active', true);
  if (error) throw new Error(error.message);
  revalidatePath('/dashboard/courses/' + input.courseId);
}

export async function regenerateShareLink(input: {
  courseId: string;
  role: ShareRole;
}): Promise<{ token: string }> {
  await deactivateShareLink(input);
  return createOrUpdateShareLink(input);
}

export async function listMembers(courseId: string): Promise<MemberRow[]> {
  const { supabase, user } = await authed();
  // Owner-only: verify the caller owns the course before exposing the roster
  // (which includes member emails resolved via the admin client).
  const { data: course } = await supabase
    .from('courses')
    .select('user_id')
    .eq('id', courseId)
    .maybeSingle();
  if (!course || course.user_id !== user.id) {
    throw new Error('Only the course owner can list members');
  }

  const admin = createAdminClient();
  const { data: members, error } = await admin
    .from('course_members')
    .select('user_id, role')
    .eq('course_id', courseId);
  if (error) throw new Error(error.message);

  const ids = (members ?? []).map((m) => m.user_id as string);
  const byId = new Map<
    string,
    { display_name: string | null; email: string | null }
  >();
  if (ids.length > 0) {
    const { data: profs } = await admin
      .from('profiles')
      .select('id, display_name, email')
      .in('id', ids);
    for (const p of profs ?? [])
      byId.set(p.id as string, {
        display_name: (p.display_name as string | null) ?? null,
        email: (p.email as string | null) ?? null,
      });
  }

  return (members ?? []).map((m) => ({
    user_id: m.user_id as string,
    role: m.role as ShareRole,
    display_name: byId.get(m.user_id as string)?.display_name ?? null,
    email: byId.get(m.user_id as string)?.email ?? null,
  }));
}

export async function updateMemberRole(input: {
  courseId: string;
  userId: string;
  role: ShareRole;
}): Promise<void> {
  const { supabase } = await authed();
  const { error } = await supabase
    .from('course_members')
    .update({ role: input.role })
    .eq('course_id', input.courseId)
    .eq('user_id', input.userId);
  if (error) throw new Error(error.message);
  revalidatePath('/dashboard/courses/' + input.courseId);
}

// Internal: remove a member's files + unfile their notes + drop membership.
// Uses the admin client so an owner can act on another user's rows.
async function removeMembership(courseId: string, targetUserId: string) {
  const admin = createAdminClient();

  const [{ data: materials }, { data: files }] = await Promise.all([
    admin
      .from('course_materials')
      .select('id, storage_path')
      .eq('course_id', courseId)
      .eq('user_id', targetUserId),
    admin
      .from('personal_files')
      .select('id, storage_path')
      .eq('course_id', courseId)
      .eq('user_id', targetUserId),
  ]);

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

  await admin
    .from('course_materials')
    .delete()
    .eq('course_id', courseId)
    .eq('user_id', targetUserId);
  await admin
    .from('personal_files')
    .delete()
    .eq('course_id', courseId)
    .eq('user_id', targetUserId);

  // Keep the target's notes — just unfile them.
  await admin
    .from('documents')
    .update({ course_id: null })
    .eq('course_id', courseId)
    .eq('user_id', targetUserId);

  await admin
    .from('course_members')
    .delete()
    .eq('course_id', courseId)
    .eq('user_id', targetUserId);
}

// Member self-leave ("Remove from my list").
export async function leaveCourse(courseId: string): Promise<void> {
  const { user } = await authed();
  await removeMembership(courseId, user.id);
  revalidatePath('/dashboard');
}

// Owner removes a member.
export async function removeMember(input: {
  courseId: string;
  userId: string;
}): Promise<void> {
  const { supabase, user } = await authed();
  const { data: course } = await supabase
    .from('courses')
    .select('user_id')
    .eq('id', input.courseId)
    .maybeSingle();
  if (!course || course.user_id !== user.id) {
    throw new Error('Only the course owner can remove members');
  }
  await removeMembership(input.courseId, input.userId);
  revalidatePath('/dashboard/courses/' + input.courseId);
}
