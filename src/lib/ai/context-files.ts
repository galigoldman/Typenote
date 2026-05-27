// Pure resolvers for document context files (the 3 imported file types).
// Auth-free: callers pass a user-scoped `supabase` client (RLS-enforced) for
// owned tables and an `admin` client for the shared Moodle registry.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ContextFileType } from '@/types/database';

interface FileSourceConfig {
  table: string;
  client: SupabaseClient;
  bucket: string;
  nameCol: string;
}

export function fileSourceConfig(
  type: ContextFileType,
  supabase: SupabaseClient,
  admin: SupabaseClient,
): FileSourceConfig {
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
  }
}

/** Display name of an attached file, or null. Never throws. */
export async function resolveContextFileName(
  supabase: SupabaseClient,
  admin: SupabaseClient,
  type: ContextFileType,
  id: string,
): Promise<string | null> {
  try {
    const cfg = fileSourceConfig(type, supabase, admin);
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

/** Name + mime + storage info for the viewer / signed URL. Never throws. */
export async function resolveContextFileMeta(
  supabase: SupabaseClient,
  admin: SupabaseClient,
  type: ContextFileType,
  id: string,
): Promise<{
  name: string;
  mimeType: string | null;
  bucket: string;
  storagePath: string | null;
} | null> {
  try {
    const cfg = fileSourceConfig(type, supabase, admin);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = (await (cfg.client as any)
      .from(cfg.table)
      .select('*')
      .eq('id', id)
      .maybeSingle()) as { data: Record<string, unknown> | null };
    if (!data) return null;
    const rawPath = (data.storage_path as string | null) ?? null;
    // Course materials store imported Moodle files with a `moodle:` prefix.
    let bucket = cfg.bucket;
    let storagePath = rawPath;
    if (type === 'course_material' && rawPath?.startsWith('moodle:')) {
      bucket = 'moodle-materials';
      storagePath = rawPath.slice('moodle:'.length);
    }
    return {
      name: String(data[cfg.nameCol] ?? '') || 'File',
      mimeType: (data.mime_type as string | null) ?? null,
      bucket,
      storagePath,
    };
  } catch {
    return null;
  }
}
