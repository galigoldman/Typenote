import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  process.env.SUPABASE_URL ??
  'http://127.0.0.1:54321';

const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  // Local-Supabase service_role JWT. CI overrides via env.
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const TEST_USER_ID = 'ac3be77d-4566-406c-9ac0-7c410634ad41';

let adminClient: SupabaseClient | null = null;

function admin(): SupabaseClient {
  if (!adminClient) {
    adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return adminClient;
}

export interface FixtureDocument {
  id: string;
  title: string;
  content: unknown;
  canvas_type: 'lined' | 'blank' | 'grid' | 'dotted';
  pages?: unknown;
  subject?: string;
  folder_id?: string | null;
}

/**
 * Force a document into a known state. Deletes any existing row with the same
 * id, then inserts with the exact content. Use in `beforeEach` to make each
 * test deterministic and immune to auto-save side effects from prior runs.
 */
export async function upsertFixtureDocument(
  doc: FixtureDocument,
): Promise<void> {
  const client = admin();
  await client.from('documents').delete().eq('id', doc.id);
  const { error } = await client.from('documents').insert({
    id: doc.id,
    user_id: TEST_USER_ID,
    folder_id: doc.folder_id ?? null,
    title: doc.title,
    content: doc.content,
    subject: doc.subject ?? 'other',
    canvas_type: doc.canvas_type,
    pages: doc.pages ?? null,
    position: 0,
  });
  if (error) {
    throw new Error(`Failed to insert fixture doc ${doc.id}: ${error.message}`);
  }
}

export async function deleteFixtureDocument(id: string): Promise<void> {
  await admin().from('documents').delete().eq('id', id);
}

export interface FixtureVersion {
  documentId: string;
  title: string;
  content: unknown;
  // Must match a value the sidebar's TRIGGER_LABELS table understands.
  // `idle`, `periodic`, `close` all render as "Auto-saved".
  // `before_restore` renders as "Before restore".
  trigger?: 'idle' | 'periodic' | 'close' | 'before_restore';
  createdAtIso?: string;
}

/**
 * Insert an explicit document_versions row via the admin client. Use this to
 * seed known historical versions for restore tests instead of relying on the
 * editor's auto-save snapshot timing.
 */
export async function insertFixtureVersion(v: FixtureVersion): Promise<string> {
  const { data, error } = await admin()
    .from('document_versions')
    .insert({
      document_id: v.documentId,
      user_id: TEST_USER_ID,
      title: v.title,
      content: v.content,
      trigger: v.trigger ?? 'idle',
      ...(v.createdAtIso ? { created_at: v.createdAtIso } : {}),
    })
    .select('id')
    .single();
  if (error || !data) {
    throw new Error(
      `Failed to insert fixture version for ${v.documentId}: ${error?.message ?? 'unknown'}`,
    );
  }
  return data.id as string;
}

export async function deleteFixtureVersions(documentId: string): Promise<void> {
  await admin()
    .from('document_versions')
    .delete()
    .eq('document_id', documentId);
}
