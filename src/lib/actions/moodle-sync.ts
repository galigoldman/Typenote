'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function saveMoodleConnection(domain: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const admin = createAdminClient();

  // Upsert instance (shared table, needs admin)
  const { data: instance, error: instanceError } = await admin
    .from('moodle_instances')
    .upsert({ domain }, { onConflict: 'domain' })
    .select()
    .single();
  if (instanceError) throw new Error(instanceError.message);

  // Create user connection (per-user table, user client is fine)
  const { error: connectionError } = await supabase
    .from('user_moodle_connections')
    .upsert(
      { user_id: user.id, instance_id: instance.id },
      { onConflict: 'user_id,instance_id' },
    );
  if (connectionError) throw new Error(connectionError.message);

  revalidatePath('/dashboard');
  return { instanceId: instance.id, domain };
}

export async function removeMoodleConnection() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('user_moodle_connections')
    .delete()
    .eq('user_id', user.id);
  if (error) throw new Error(error.message);

  revalidatePath('/dashboard');
}
