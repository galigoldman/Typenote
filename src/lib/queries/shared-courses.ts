import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Course } from '@/types/database';

export interface SharedCourse extends Course {
  member_role: 'viewer' | 'contributor';
  owner_name: string | null;
}

export async function getSharedWithMe(
  supabase: SupabaseClient,
  userId: string,
): Promise<SharedCourse[]> {
  const { data, error } = await supabase
    .from('course_members')
    .select(
      'role, courses(id, user_id, folder_id, name, color, position, created_at, updated_at)',
    )
    .eq('user_id', userId);
  if (error) throw new Error(error.message);

  const rows = (data ?? [])
    .map((row) => {
      const c = (
        Array.isArray(row.courses) ? row.courses[0] : row.courses
      ) as Course | null;
      if (!c) return null;
      return { course: c, role: row.role as 'viewer' | 'contributor' };
    })
    .filter(
      (r): r is { course: Course; role: 'viewer' | 'contributor' } =>
        r !== null,
    );

  // Resolve owner display names via the admin client (profiles RLS hides other
  // users' rows from the member). Owner display name is low-sensitivity — it's
  // shown to people the owner deliberately shared the course with.
  const ownerIds = [...new Set(rows.map((r) => r.course.user_id))];
  const nameById = new Map<string, string | null>();
  if (ownerIds.length > 0) {
    const admin = createAdminClient();
    const { data: profs } = await admin
      .from('profiles')
      .select('id, display_name')
      .in('id', ownerIds);
    for (const p of profs ?? [])
      nameById.set(p.id as string, (p.display_name as string | null) ?? null);
  }

  return rows.map((r) => ({
    ...r.course,
    member_role: r.role,
    owner_name: nameById.get(r.course.user_id) ?? null,
  }));
}
