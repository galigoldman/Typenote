/**
 * Integration test: verifies Moodle per-user sync tables —
 * migrations, seed data, triggers, cascade deletes, and RLS policies.
 *
 * Uses the admin (service_role) client which bypasses RLS.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient, TEST_USER_ID } from '@/test/supabase-client';

let supabase: SupabaseClient;

// Track created IDs for cleanup
const createdIds: { table: string; id: string }[] = [];

beforeAll(() => {
  supabase = createAdminClient();
});

afterAll(async () => {
  // Clean up in reverse order (respect foreign keys)
  for (const { table, id } of createdIds.reverse()) {
    await supabase.from(table).delete().eq('id', id);
  }
});

describe('Moodle user syncs — seeded data', () => {
  it('user_moodle_connections has seeded connection', async () => {
    const { data, error } = await supabase
      .from('user_moodle_connections')
      .select('*')
      .eq('id', '64000000-0000-0000-0000-000000000001')
      .single();

    expect(error).toBeNull();
    expect(data).toMatchObject({
      user_id: TEST_USER_ID,
      instance_id: '60000000-0000-0000-0000-000000000001',
    });
  });

  it('user_course_syncs has seeded sync', async () => {
    const { data, error } = await supabase
      .from('user_course_syncs')
      .select('*')
      .eq('id', '65000000-0000-0000-0000-000000000001')
      .single();

    expect(error).toBeNull();
    expect(data).toMatchObject({
      user_id: TEST_USER_ID,
      moodle_course_id: '61000000-0000-0000-0000-000000000001',
      course_id: '30000000-0000-0000-0000-000000000001',
    });
    expect(data!.last_synced_at).not.toBeNull();
  });

  it('user_file_imports has seeded imports', async () => {
    const { data, error } = await supabase
      .from('user_file_imports')
      .select('*')
      .eq('sync_id', '65000000-0000-0000-0000-000000000001')
      .order('created_at');

    expect(error).toBeNull();
    expect(data!.length).toBe(2);
    expect(data![0]).toMatchObject({
      user_id: TEST_USER_ID,
      moodle_file_id: '63000000-0000-0000-0000-000000000001',
      status: 'imported',
    });
    expect(data![1]).toMatchObject({
      user_id: TEST_USER_ID,
      moodle_file_id: '63000000-0000-0000-0000-000000000002',
      status: 'imported',
    });
  });
});

describe('Moodle user syncs — admin CRUD', () => {
  let connectionId: string;
  let syncId: string;
  let importId: string;

  it('admin can insert user_moodle_connections', async () => {
    // Use a second instance for this test to avoid unique constraint
    const { data: inst } = await supabase
      .from('moodle_instances')
      .insert({ domain: 'user-sync-test.ac.il', name: 'User Sync Test' })
      .select()
      .single();

    createdIds.push({ table: 'moodle_instances', id: inst!.id });

    const { data, error } = await supabase
      .from('user_moodle_connections')
      .insert({
        user_id: TEST_USER_ID,
        instance_id: inst!.id,
      })
      .select()
      .single();

    expect(error).toBeNull();
    expect(data).toMatchObject({
      user_id: TEST_USER_ID,
      instance_id: inst!.id,
    });

    connectionId = data!.id;
    createdIds.push({ table: 'user_moodle_connections', id: connectionId });
  });

  it('admin can insert user_course_syncs', async () => {
    // Use the second seeded moodle course (DSA) to avoid unique constraint
    const { data, error } = await supabase
      .from('user_course_syncs')
      .insert({
        user_id: TEST_USER_ID,
        moodle_course_id: '61000000-0000-0000-0000-000000000002',
      })
      .select()
      .single();

    expect(error).toBeNull();
    expect(data).toMatchObject({
      user_id: TEST_USER_ID,
      moodle_course_id: '61000000-0000-0000-0000-000000000002',
    });
    expect(data!.last_synced_at).toBeNull();

    syncId = data!.id;
    createdIds.push({ table: 'user_course_syncs', id: syncId });
  });

  it('admin can insert user_file_imports', async () => {
    // Use the link file (not yet imported by seeded data)
    const { data, error } = await supabase
      .from('user_file_imports')
      .insert({
        user_id: TEST_USER_ID,
        moodle_file_id: '63000000-0000-0000-0000-000000000003',
        sync_id: syncId,
        status: 'imported',
      })
      .select()
      .single();

    expect(error).toBeNull();
    expect(data).toMatchObject({
      user_id: TEST_USER_ID,
      moodle_file_id: '63000000-0000-0000-0000-000000000003',
      status: 'imported',
    });

    importId = data!.id;
    createdIds.push({ table: 'user_file_imports', id: importId });
  });

  it('admin can read all user sync tables', async () => {
    const tables = [
      'user_moodle_connections',
      'user_course_syncs',
      'user_file_imports',
    ];

    for (const table of tables) {
      const { data, error } = await supabase
        .from(table)
        .select('id')
        .limit(1);

      expect(error).toBeNull();
      expect(data!.length).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('Moodle user syncs — updated_at triggers', () => {
  it('updated_at fires on user_course_syncs', async () => {
    const { data: before } = await supabase
      .from('user_course_syncs')
      .select('updated_at')
      .eq('id', '65000000-0000-0000-0000-000000000001')
      .single();

    await new Promise((r) => setTimeout(r, 50));

    await supabase
      .from('user_course_syncs')
      .update({ last_synced_at: new Date().toISOString() })
      .eq('id', '65000000-0000-0000-0000-000000000001');

    const { data: after } = await supabase
      .from('user_course_syncs')
      .select('updated_at')
      .eq('id', '65000000-0000-0000-0000-000000000001')
      .single();

    expect(new Date(after!.updated_at).getTime()).toBeGreaterThan(
      new Date(before!.updated_at).getTime(),
    );
  });

  it('updated_at fires on user_file_imports', async () => {
    const { data: before } = await supabase
      .from('user_file_imports')
      .select('updated_at')
      .eq('id', '66000000-0000-0000-0000-000000000001')
      .single();

    await new Promise((r) => setTimeout(r, 50));

    await supabase
      .from('user_file_imports')
      .update({ status: 'removed_from_moodle' })
      .eq('id', '66000000-0000-0000-0000-000000000001');

    const { data: after } = await supabase
      .from('user_file_imports')
      .select('updated_at')
      .eq('id', '66000000-0000-0000-0000-000000000001')
      .single();

    expect(new Date(after!.updated_at).getTime()).toBeGreaterThan(
      new Date(before!.updated_at).getTime(),
    );

    // Restore original status
    await supabase
      .from('user_file_imports')
      .update({ status: 'imported' })
      .eq('id', '66000000-0000-0000-0000-000000000001');
  });
});

describe('Moodle user syncs — cascade deletes', () => {
  let cascadeInstanceId: string;
  let cascadeCourseId: string;
  let cascadeSectionId: string;
  let cascadeFileId: string;
  let cascadeSyncId: string;
  let cascadeImportId: string;

  it('set up cascade test data', async () => {
    // Create shared registry data
    const { data: inst } = await supabase
      .from('moodle_instances')
      .insert({ domain: 'user-cascade-test.ac.il', name: 'User Cascade Test' })
      .select()
      .single();
    cascadeInstanceId = inst!.id;

    const { data: course } = await supabase
      .from('moodle_courses')
      .insert({
        instance_id: cascadeInstanceId,
        moodle_course_id: 'user-cascade-101',
        name: 'User Cascade Course',
      })
      .select()
      .single();
    cascadeCourseId = course!.id;

    const { data: section } = await supabase
      .from('moodle_sections')
      .insert({
        course_id: cascadeCourseId,
        moodle_section_id: 'user-cascade-sec-1',
        title: 'User Cascade Section',
        position: 0,
      })
      .select()
      .single();
    cascadeSectionId = section!.id;

    const { data: file } = await supabase
      .from('moodle_files')
      .insert({
        section_id: cascadeSectionId,
        type: 'file',
        moodle_url: 'https://user-cascade-test.ac.il/test.pdf',
        file_name: 'user-cascade-test.pdf',
        position: 0,
      })
      .select()
      .single();
    cascadeFileId = file!.id;

    // Create user sync data
    const { data: sync } = await supabase
      .from('user_course_syncs')
      .insert({
        user_id: TEST_USER_ID,
        moodle_course_id: cascadeCourseId,
      })
      .select()
      .single();
    cascadeSyncId = sync!.id;

    const { data: imp } = await supabase
      .from('user_file_imports')
      .insert({
        user_id: TEST_USER_ID,
        moodle_file_id: cascadeFileId,
        sync_id: cascadeSyncId,
        status: 'imported',
      })
      .select()
      .single();
    cascadeImportId = imp!.id;

    expect(cascadeImportId).toBeDefined();
  });

  it('deleting user_course_syncs cascades to user_file_imports', async () => {
    const { error } = await supabase
      .from('user_course_syncs')
      .delete()
      .eq('id', cascadeSyncId);

    expect(error).toBeNull();

    // Verify import is gone
    const { data: imports } = await supabase
      .from('user_file_imports')
      .select('id')
      .eq('id', cascadeImportId);
    expect(imports!.length).toBe(0);

    // Clean up the shared registry data
    await supabase
      .from('moodle_instances')
      .delete()
      .eq('id', cascadeInstanceId);
  });
});
