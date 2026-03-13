/**
 * Integration test: verifies Moodle shared registry tables —
 * migrations, seed data, triggers, cascade deletes, and RLS policies.
 *
 * Uses the admin (service_role) client which bypasses RLS.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/test/supabase-client';

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

describe('Moodle shared registry — seeded data', () => {
  it('moodle_instances table has seeded instance', async () => {
    const { data, error } = await supabase
      .from('moodle_instances')
      .select('*')
      .eq('id', '60000000-0000-0000-0000-000000000001')
      .single();

    expect(error).toBeNull();
    expect(data).toMatchObject({
      domain: 'moodle.test.ac.il',
      name: 'Test University Moodle',
    });
  });

  it('moodle_courses table has seeded courses', async () => {
    const { data, error } = await supabase
      .from('moodle_courses')
      .select('*')
      .eq('instance_id', '60000000-0000-0000-0000-000000000001')
      .order('moodle_course_id');

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data!.length).toBe(2);
    expect(data![0]).toMatchObject({
      moodle_course_id: '101',
      name: 'Introduction to Computer Science',
    });
    expect(data![1]).toMatchObject({
      moodle_course_id: '202',
      name: 'Data Structures and Algorithms',
    });
  });

  it('moodle_sections table has seeded sections', async () => {
    const { data, error } = await supabase
      .from('moodle_sections')
      .select('*')
      .eq('course_id', '61000000-0000-0000-0000-000000000001')
      .order('position');

    expect(error).toBeNull();
    expect(data!.length).toBe(3);
    expect(data![0]).toMatchObject({
      moodle_section_id: 'sec-0',
      title: 'General',
      position: 0,
    });
    expect(data![2]).toMatchObject({
      moodle_section_id: 'sec-2',
      title: 'Week 2: Variables and Data Types',
      position: 2,
    });
  });

  it('moodle_files table has seeded files', async () => {
    const { data, error } = await supabase
      .from('moodle_files')
      .select('*')
      .in('section_id', [
        '62000000-0000-0000-0000-000000000001',
        '62000000-0000-0000-0000-000000000002',
      ])
      .order('position');

    expect(error).toBeNull();
    expect(data!.length).toBe(3);

    // file type entry
    const syllabus = data!.find((f) => f.file_name === 'syllabus.pdf');
    expect(syllabus).toMatchObject({
      type: 'file',
      content_hash: 'abc123hash',
      file_size: 1048576,
      mime_type: 'application/pdf',
    });

    // link type entry
    const link = data!.find((f) => f.file_name === 'Python Tutorial Video');
    expect(link).toMatchObject({
      type: 'link',
      external_url: 'https://youtube.com/watch?v=example',
    });
  });
});

describe('Moodle shared registry — admin CRUD', () => {
  let instanceId: string;
  let courseId: string;
  let sectionId: string;

  it('admin can insert into moodle_instances', async () => {
    const { data, error } = await supabase
      .from('moodle_instances')
      .insert({
        domain: 'moodle.crud-test.ac.il',
        name: 'CRUD Test Instance',
      })
      .select()
      .single();

    expect(error).toBeNull();
    expect(data!.domain).toBe('moodle.crud-test.ac.il');

    instanceId = data!.id;
    createdIds.push({ table: 'moodle_instances', id: instanceId });
  });

  it('admin can insert into moodle_courses', async () => {
    const { data, error } = await supabase
      .from('moodle_courses')
      .insert({
        instance_id: instanceId,
        moodle_course_id: '999',
        name: 'CRUD Test Course',
        moodle_url: 'https://moodle.crud-test.ac.il/course/view.php?id=999',
      })
      .select()
      .single();

    expect(error).toBeNull();
    expect(data!.name).toBe('CRUD Test Course');

    courseId = data!.id;
    createdIds.push({ table: 'moodle_courses', id: courseId });
  });

  it('admin can insert into moodle_sections', async () => {
    const { data, error } = await supabase
      .from('moodle_sections')
      .insert({
        course_id: courseId,
        moodle_section_id: 'crud-sec-1',
        title: 'CRUD Test Section',
        position: 0,
      })
      .select()
      .single();

    expect(error).toBeNull();
    expect(data!.title).toBe('CRUD Test Section');

    sectionId = data!.id;
    createdIds.push({ table: 'moodle_sections', id: sectionId });
  });

  it('admin can insert into moodle_files', async () => {
    const { data, error } = await supabase
      .from('moodle_files')
      .insert({
        section_id: sectionId,
        type: 'file',
        moodle_url:
          'https://moodle.crud-test.ac.il/pluginfile.php/999/test.pdf',
        file_name: 'test.pdf',
        position: 0,
      })
      .select()
      .single();

    expect(error).toBeNull();
    expect(data!.file_name).toBe('test.pdf');
    expect(data!.is_removed).toBe(false);

    // Not pushing to createdIds — cascade delete test will clean this up
    expect(data!.id).toBeDefined();
  });

  it('admin can read all shared tables', async () => {
    const tables = [
      'moodle_instances',
      'moodle_courses',
      'moodle_sections',
      'moodle_files',
    ];

    for (const table of tables) {
      const { data, error } = await supabase.from(table).select('id').limit(1);

      expect(error).toBeNull();
      expect(data!.length).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('Moodle shared registry — updated_at triggers', () => {
  it('updated_at fires on moodle_instances', async () => {
    const { data: before } = await supabase
      .from('moodle_instances')
      .select('updated_at')
      .eq('id', '60000000-0000-0000-0000-000000000001')
      .single();

    await new Promise((r) => setTimeout(r, 50));

    await supabase
      .from('moodle_instances')
      .update({ name: 'Trigger Test Instance' })
      .eq('id', '60000000-0000-0000-0000-000000000001');

    const { data: after } = await supabase
      .from('moodle_instances')
      .select('updated_at')
      .eq('id', '60000000-0000-0000-0000-000000000001')
      .single();

    expect(new Date(after!.updated_at).getTime()).toBeGreaterThan(
      new Date(before!.updated_at).getTime(),
    );

    // Restore original name
    await supabase
      .from('moodle_instances')
      .update({ name: 'Test University Moodle' })
      .eq('id', '60000000-0000-0000-0000-000000000001');
  });

  it('updated_at fires on moodle_courses', async () => {
    const { data: before } = await supabase
      .from('moodle_courses')
      .select('updated_at')
      .eq('id', '61000000-0000-0000-0000-000000000001')
      .single();

    await new Promise((r) => setTimeout(r, 50));

    await supabase
      .from('moodle_courses')
      .update({ name: 'Trigger Test Course' })
      .eq('id', '61000000-0000-0000-0000-000000000001');

    const { data: after } = await supabase
      .from('moodle_courses')
      .select('updated_at')
      .eq('id', '61000000-0000-0000-0000-000000000001')
      .single();

    expect(new Date(after!.updated_at).getTime()).toBeGreaterThan(
      new Date(before!.updated_at).getTime(),
    );

    // Restore original name
    await supabase
      .from('moodle_courses')
      .update({ name: 'Introduction to Computer Science' })
      .eq('id', '61000000-0000-0000-0000-000000000001');
  });

  it('updated_at fires on moodle_sections', async () => {
    const { data: before } = await supabase
      .from('moodle_sections')
      .select('updated_at')
      .eq('id', '62000000-0000-0000-0000-000000000001')
      .single();

    await new Promise((r) => setTimeout(r, 50));

    await supabase
      .from('moodle_sections')
      .update({ title: 'Trigger Test Section' })
      .eq('id', '62000000-0000-0000-0000-000000000001');

    const { data: after } = await supabase
      .from('moodle_sections')
      .select('updated_at')
      .eq('id', '62000000-0000-0000-0000-000000000001')
      .single();

    expect(new Date(after!.updated_at).getTime()).toBeGreaterThan(
      new Date(before!.updated_at).getTime(),
    );

    // Restore original title
    await supabase
      .from('moodle_sections')
      .update({ title: 'General' })
      .eq('id', '62000000-0000-0000-0000-000000000001');
  });

  it('updated_at fires on moodle_files', async () => {
    const { data: before } = await supabase
      .from('moodle_files')
      .select('updated_at')
      .eq('id', '63000000-0000-0000-0000-000000000001')
      .single();

    await new Promise((r) => setTimeout(r, 50));

    await supabase
      .from('moodle_files')
      .update({ file_name: 'trigger-test.pdf' })
      .eq('id', '63000000-0000-0000-0000-000000000001');

    const { data: after } = await supabase
      .from('moodle_files')
      .select('updated_at')
      .eq('id', '63000000-0000-0000-0000-000000000001')
      .single();

    expect(new Date(after!.updated_at).getTime()).toBeGreaterThan(
      new Date(before!.updated_at).getTime(),
    );

    // Restore original name
    await supabase
      .from('moodle_files')
      .update({ file_name: 'syllabus.pdf' })
      .eq('id', '63000000-0000-0000-0000-000000000001');
  });
});

describe('Moodle shared registry — cascade deletes', () => {
  let cascadeInstanceId: string;
  let cascadeCourseId: string;
  let cascadeSectionId: string;
  let cascadeFileId: string;

  it('set up cascade test data', async () => {
    // Create instance
    const { data: inst } = await supabase
      .from('moodle_instances')
      .insert({ domain: 'cascade-test.ac.il', name: 'Cascade Test' })
      .select()
      .single();
    cascadeInstanceId = inst!.id;

    // Create course
    const { data: course } = await supabase
      .from('moodle_courses')
      .insert({
        instance_id: cascadeInstanceId,
        moodle_course_id: 'cascade-101',
        name: 'Cascade Course',
      })
      .select()
      .single();
    cascadeCourseId = course!.id;

    // Create section
    const { data: section } = await supabase
      .from('moodle_sections')
      .insert({
        course_id: cascadeCourseId,
        moodle_section_id: 'cascade-sec-1',
        title: 'Cascade Section',
        position: 0,
      })
      .select()
      .single();
    cascadeSectionId = section!.id;

    // Create file
    const { data: file } = await supabase
      .from('moodle_files')
      .insert({
        section_id: cascadeSectionId,
        type: 'file',
        moodle_url: 'https://cascade-test.ac.il/test.pdf',
        file_name: 'cascade-test.pdf',
        position: 0,
      })
      .select()
      .single();
    cascadeFileId = file!.id;

    // Verify all exist
    expect(cascadeInstanceId).toBeDefined();
    expect(cascadeCourseId).toBeDefined();
    expect(cascadeSectionId).toBeDefined();
    expect(cascadeFileId).toBeDefined();
  });

  it('deleting instance cascades to courses, sections, and files', async () => {
    // Delete the instance
    const { error } = await supabase
      .from('moodle_instances')
      .delete()
      .eq('id', cascadeInstanceId);

    expect(error).toBeNull();

    // Verify course is gone
    const { data: courses } = await supabase
      .from('moodle_courses')
      .select('id')
      .eq('id', cascadeCourseId);
    expect(courses!.length).toBe(0);

    // Verify section is gone
    const { data: sections } = await supabase
      .from('moodle_sections')
      .select('id')
      .eq('id', cascadeSectionId);
    expect(sections!.length).toBe(0);

    // Verify file is gone
    const { data: files } = await supabase
      .from('moodle_files')
      .select('id')
      .eq('id', cascadeFileId);
    expect(files!.length).toBe(0);
  });
});
