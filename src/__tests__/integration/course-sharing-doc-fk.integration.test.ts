import { describe, it, expect, afterEach, beforeAll } from 'vitest';
import { createAdminClient, TEST_USER_B } from '@/test/supabase-client';

const admin = createAdminClient();
const COURSE = 'c0000000-0000-0000-0000-000000000020';
const DOC = 'd0000000-0000-0000-0000-000000000020';

async function cleanup() {
  await admin.from('documents').delete().eq('id', DOC);
  await admin.from('courses').delete().eq('id', COURSE);
}

describe('documents.course_id on delete set null', () => {
  beforeAll(cleanup);
  afterEach(cleanup);

  it('deleting a course nulls the doc course_id instead of deleting the doc', async () => {
    await admin
      .from('courses')
      .insert({ id: COURSE, user_id: TEST_USER_B.id, name: 'C' });
    await admin.from('documents').insert({
      id: DOC,
      user_id: TEST_USER_B.id,
      course_id: COURSE,
      title: 'Note',
      subject: 'other',
      canvas_type: 'blank',
      position: 0,
    });

    await admin.from('courses').delete().eq('id', COURSE);

    const { data } = await admin
      .from('documents')
      .select('id, course_id')
      .eq('id', DOC)
      .maybeSingle();
    expect(data).not.toBeNull(); // doc survives
    expect(data!.course_id).toBeNull(); // unfiled
  });
});
