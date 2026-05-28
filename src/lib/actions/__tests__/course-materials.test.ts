import { afterEach, describe, expect, it, vi } from 'vitest';

const indexContent = vi.fn(async () => ({
  success: true,
  segmentsIndexed: 3,
  skipped: false,
}));
vi.mock('../ai-context', () => ({ indexContent }));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: 'u1' } }, error: null })),
    },
    from: vi.fn(() => ({
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(async () => ({
            data: { id: 'mat-1', course_id: 'course-1' },
            error: null,
          })),
        })),
      })),
    })),
  })),
}));

import { createCourseMaterial } from '../course-materials';

afterEach(() => vi.clearAllMocks());

describe('createCourseMaterial', () => {
  it('awaits indexContent for an embeddable PDF', async () => {
    await createCourseMaterial({
      course_id: 'course-1',
      category: 'material',
      storage_path: 'p.pdf',
      file_name: 'p.pdf',
      file_size: 10,
      mime_type: 'application/pdf',
    });
    expect(indexContent).toHaveBeenCalledWith({
      type: 'course_material',
      materialId: 'mat-1',
      courseId: 'course-1',
    });
  });

  it('does not index a non-embeddable type (e.g. image)', async () => {
    await createCourseMaterial({
      course_id: 'course-1',
      category: 'material',
      storage_path: 'p.png',
      file_name: 'p.png',
      file_size: 10,
      mime_type: 'image/png',
    });
    expect(indexContent).not.toHaveBeenCalled();
  });

  it('still succeeds (returns the material) when indexing throws', async () => {
    // Indexing is an enhancement, not a precondition — a failure must not fail
    // the upload. Verifies the try/catch around the awaited indexContent.
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    indexContent.mockRejectedValueOnce(new Error('embed outage'));

    const material = await createCourseMaterial({
      course_id: 'course-1',
      category: 'material',
      storage_path: 'p.pdf',
      file_name: 'p.pdf',
      file_size: 10,
      mime_type: 'application/pdf',
    });

    expect(material).toEqual({ id: 'mat-1', course_id: 'course-1' });
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});
