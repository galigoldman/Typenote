import { describe, it, expect } from 'vitest';
import { createAdminClient } from '@/test/supabase-client';
import { resolveHomeworkContext } from '@/lib/ai/homework-context';

const HW_DOC_ID = '20000000-0000-0000-0000-000000000011';

describe('resolveHomeworkContext (integration, seeded data)', () => {
  it('returns null for a non-homework document', async () => {
    const admin = createAdminClient();
    const ctx = await resolveHomeworkContext(
      admin,
      admin,
      'ffffffff-0000-0000-0000-000000000000',
    );
    expect(ctx).toBeNull();
  });

  it('extracts the seeded exercise document text (Tier 1)', async () => {
    const admin = createAdminClient();
    const ctx = await resolveHomeworkContext(admin, admin, HW_DOC_ID);
    expect(ctx).not.toBeNull();
    expect(ctx!.exerciseName).toMatch(/Problem Set 1/);
    // From the seeded exercise document content:
    expect(ctx!.exerciseText).toContain('mutable and immutable');
    expect(ctx!.exerciseText).toContain('x = [1, 2, 3]'); // codeBlock preserved
  });

  it('keeps the pinned material name even though its storage object is not seeded', async () => {
    const admin = createAdminClient();
    const ctx = await resolveHomeworkContext(admin, admin, HW_DOC_ID);
    // seeded pin: course_material 50000000-...001 = "lecture-1-slides.pdf"
    expect(ctx!.pinnedNames).toContain('lecture-1-slides.pdf');
    // No storage object is seeded, so text degrades to '' (graceful).
    const pinned = ctx!.pinned.find((p) => p.name === 'lecture-1-slides.pdf');
    expect(pinned?.text).toBe('');
  });

  it('references a file exercise (course_material) by name only — no extraction', async () => {
    const admin = createAdminClient();
    const SEED_USER = 'ac3be77d-4566-406c-9ac0-7c410634ad41';
    const SEED_COURSE = '30000000-0000-0000-0000-000000000001';
    const HW1_MATERIAL = '50000000-0000-0000-0000-000000000002'; // homework-1.pdf

    // A homework doc whose exercise is an imported course material (not a
    // typed note). Created here (not seeded) and cleaned up after the assert.
    const docId = crypto.randomUUID();
    await admin.from('documents').insert({
      id: docId,
      user_id: SEED_USER,
      course_id: SEED_COURSE,
      purpose: 'homework',
      title: 'HW — homework-1.pdf',
      content: {},
      subject: 'other',
      canvas_type: 'blank',
    });
    await admin.from('homework_sessions').insert({
      document_id: docId,
      course_id: SEED_COURSE,
      user_id: SEED_USER,
      exercise_type: 'course_material',
      exercise_id: HW1_MATERIAL,
      exercise_document_id: null,
    });

    try {
      const ctx = await resolveHomeworkContext(admin, admin, docId);
      expect(ctx).not.toBeNull();
      expect(ctx!.exerciseName).toBe('homework-1.pdf');
      // Content reaches the model via Tier-3 RAG, not as verbatim Tier-1 text.
      expect(ctx!.exerciseText).toBe('');
    } finally {
      // documents ON DELETE CASCADE removes the homework_sessions row too.
      await admin.from('documents').delete().eq('id', docId);
    }
  });
});
