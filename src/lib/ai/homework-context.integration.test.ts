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
});
