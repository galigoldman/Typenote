import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: { id: 'test-user-id' } },
        error: null,
      })),
    },
    from: vi.fn(() => ({
      delete: vi.fn(() => ({
        eq: vi.fn(function eq1() {
          return {
            eq: vi.fn(async () => ({ error: null })),
          };
        }),
      })),
    })),
  })),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { removeMoodleFileFromNotebook } from '../moodle-sync';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('removeMoodleFileFromNotebook', () => {
  it('deletes the user_file_imports row scoped to the current user', async () => {
    await removeMoodleFileFromNotebook('file-1', 'course-1');

    expect(revalidatePath).toHaveBeenCalledWith('/dashboard/courses/course-1');
  });

  it('rejects unauthenticated callers', async () => {
    vi.mocked(createClient).mockResolvedValueOnce({
      auth: {
        getUser: vi.fn(async () => ({
          data: { user: null },
          error: null,
        })),
      },
      from: vi.fn(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    await expect(
      removeMoodleFileFromNotebook('file-1', 'course-1'),
    ).rejects.toThrow('Unauthorized');
  });
});
