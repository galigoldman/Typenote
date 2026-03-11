import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Supabase server client
const mockGetUser = vi.fn();
const mockFrom = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

// Mock Supabase admin client
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}));

// Mock revalidatePath
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

// Must import after mocks are set up
import { recordFileImports } from './moodle-sync';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const mockCreateClient = createClient as ReturnType<typeof vi.fn>;
const mockCreateAdminClient = createAdminClient as ReturnType<typeof vi.fn>;

describe('recordFileImports', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Re-establish mock implementations after each clear
    mockCreateClient.mockResolvedValue({
      auth: { getUser: mockGetUser },
    });
    mockCreateAdminClient.mockReturnValue({
      from: mockFrom,
    });
  });

  it('throws when user is not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    await expect(recordFileImports('course-1', ['file-1'])).rejects.toThrow(
      'Not authenticated',
    );
  });

  it('creates sync record and file imports for given file IDs', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
    });

    const mockUpsertChain = {
      upsert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { id: 'sync-record-1' },
        error: null,
      }),
    };

    const mockImportUpsert = {
      upsert: vi.fn().mockResolvedValue({ error: null }),
    };

    // First call: user_course_syncs upsert
    // Second call: user_file_imports upsert
    mockFrom
      .mockReturnValueOnce(mockUpsertChain)
      .mockReturnValueOnce(mockImportUpsert);

    const result = await recordFileImports('course-uuid-1', [
      'file-1',
      'file-2',
    ]);

    expect(result).toEqual({
      syncId: 'sync-record-1',
      importedCount: 2,
    });

    // Verify sync record upsert
    expect(mockFrom).toHaveBeenCalledWith('user_course_syncs');
    expect(mockUpsertChain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-123',
        moodle_course_id: 'course-uuid-1',
        course_id: null,
      }),
      { onConflict: 'user_id,moodle_course_id' },
    );

    // Verify file imports upsert
    expect(mockFrom).toHaveBeenCalledWith('user_file_imports');
    expect(mockImportUpsert.upsert).toHaveBeenCalledWith(
      [
        {
          user_id: 'user-123',
          moodle_file_id: 'file-1',
          sync_id: 'sync-record-1',
          status: 'imported',
        },
        {
          user_id: 'user-123',
          moodle_file_id: 'file-2',
          sync_id: 'sync-record-1',
          status: 'imported',
        },
      ],
      { onConflict: 'user_id,moodle_file_id' },
    );
  });

  it('skips file imports upsert when fileIds is empty', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
    });

    const mockUpsertChain = {
      upsert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { id: 'sync-record-1' },
        error: null,
      }),
    };

    mockFrom.mockReturnValueOnce(mockUpsertChain);

    const result = await recordFileImports('course-uuid-1', []);

    expect(result).toEqual({
      syncId: 'sync-record-1',
      importedCount: 0,
    });

    // Only called once (for user_course_syncs), not for user_file_imports
    expect(mockFrom).toHaveBeenCalledTimes(1);
    expect(mockFrom).toHaveBeenCalledWith('user_course_syncs');
  });

  it('passes courseId when provided', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
    });

    const mockUpsertChain = {
      upsert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { id: 'sync-record-1' },
        error: null,
      }),
    };

    mockFrom.mockReturnValueOnce(mockUpsertChain);

    await recordFileImports('course-uuid-1', [], 'typenote-course-1');

    expect(mockUpsertChain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        course_id: 'typenote-course-1',
      }),
      expect.any(Object),
    );
  });

  it('throws when sync record upsert fails', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
    });

    const mockUpsertChain = {
      upsert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'unique constraint violation' },
      }),
    };

    mockFrom.mockReturnValueOnce(mockUpsertChain);

    await expect(
      recordFileImports('course-uuid-1', ['file-1']),
    ).rejects.toThrow('Sync record failed: unique constraint violation');
  });

  it('throws when file import upsert fails', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
    });

    const mockUpsertChain = {
      upsert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { id: 'sync-record-1' },
        error: null,
      }),
    };

    const mockImportUpsert = {
      upsert: vi.fn().mockResolvedValue({
        error: { message: 'foreign key violation' },
      }),
    };

    mockFrom
      .mockReturnValueOnce(mockUpsertChain)
      .mockReturnValueOnce(mockImportUpsert);

    await expect(
      recordFileImports('course-uuid-1', ['file-1']),
    ).rejects.toThrow('Import record failed: foreign key violation');
  });
});
