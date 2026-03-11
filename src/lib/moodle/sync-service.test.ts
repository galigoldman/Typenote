import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  compareCourses,
  detectChanges,
  flagRemovedFiles,
  updateModifiedFile,
} from './sync-service';
import type { ChangeDetectionResult } from './sync-service';

// Mock the admin client
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}));

import { createAdminClient } from '@/lib/supabase/admin';

const mockCreateAdminClient = createAdminClient as ReturnType<typeof vi.fn>;

/**
 * Helper to build a chainable mock Supabase client.
 * Each call to `.single()` pops the next result from the queue.
 */
function createMockAdmin(singleResults: Array<{ data: unknown }>) {
  let callIndex = 0;
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.from = vi.fn().mockReturnValue(chain);
  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.single = vi.fn().mockImplementation(() => {
    const result = singleResults[callIndex] ?? { data: null };
    callIndex++;
    return Promise.resolve(result);
  });
  return chain;
}

/**
 * Extended mock admin that supports additional chain methods
 * needed by detectChanges, flagRemovedFiles, and updateModifiedFile.
 *
 * queryResults: queued results for select queries (returned by .order() or .single())
 * updateResults: queued results for update operations (returned by terminal .in()/.eq() after .update())
 * storageRemoveResult: result of storage.from().remove()
 *
 * Chain mode tracking: calling .update() sets inUpdateMode so the next
 * .in() or .eq() resolves from updateResults instead of returning the chain.
 */
function createExtendedMockAdmin(opts: {
  queryResults?: Array<{ data: unknown; error?: unknown }>;
  updateResults?: Array<{ data: unknown; error?: unknown }>;
  storageRemoveResult?: { data: unknown; error?: unknown };
}) {
  let queryIndex = 0;
  let updateIndex = 0;
  let inUpdateMode = false;
  const queries = opts.queryResults ?? [];
  const updates = opts.updateResults ?? [];

  const chain: Record<string, ReturnType<typeof vi.fn>> = {};

  chain.from = vi.fn().mockImplementation(() => {
    // Reset update mode on new .from() call
    inUpdateMode = false;
    return chain;
  });
  chain.select = vi.fn().mockReturnValue(chain);

  chain.eq = vi.fn().mockImplementation(() => {
    if (inUpdateMode) {
      // Terminal call after .update() — resolve from updateResults
      const result = updates[updateIndex] ?? { data: null, error: null };
      updateIndex++;
      inUpdateMode = false;
      return Promise.resolve(result);
    }
    // In select chain — keep chaining
    return chain;
  });

  chain.in = vi.fn().mockImplementation(() => {
    if (inUpdateMode) {
      // Terminal call after .update() — resolve from updateResults
      const result = updates[updateIndex] ?? { data: null, error: null };
      updateIndex++;
      inUpdateMode = false;
      return Promise.resolve(result);
    }
    // In select chain — keep chaining
    return chain;
  });

  chain.order = vi.fn().mockImplementation(() => {
    const result = queries[queryIndex] ?? { data: null };
    queryIndex++;
    return Promise.resolve(result);
  });

  chain.single = vi.fn().mockImplementation(() => {
    const result = queries[queryIndex] ?? { data: null };
    queryIndex++;
    return Promise.resolve(result);
  });

  chain.update = vi.fn().mockImplementation(() => {
    inUpdateMode = true;
    return chain;
  });

  // Storage mock
  const storageChain: Record<string, ReturnType<typeof vi.fn>> = {};
  storageChain.from = vi.fn().mockReturnValue(storageChain);
  storageChain.remove = vi.fn().mockResolvedValue(
    opts.storageRemoveResult ?? { data: null, error: null },
  );

  (chain as Record<string, unknown>).storage = storageChain;

  return chain;
}

const scrapedCourses = [
  {
    moodleCourseId: 'CS101',
    name: 'Intro to CS',
    url: 'https://moodle.example.com/course/view.php?id=101',
  },
];

describe('compareCourses', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns new_to_system when instance does not exist', async () => {
    const mock = createMockAdmin([
      { data: null }, // instance lookup returns null
    ]);
    mockCreateAdminClient.mockReturnValue(mock);

    const result = await compareCourses('moodle.example.com', scrapedCourses, 'user-1');

    expect(result).toEqual([
      {
        moodleCourseId: 'CS101',
        name: 'Intro to CS',
        moodleUrl: 'https://moodle.example.com/course/view.php?id=101',
        status: 'new_to_system',
      },
    ]);
  });

  it('returns new_to_system when instance exists but course is not in registry', async () => {
    const mock = createMockAdmin([
      { data: { id: 'inst-1' } },  // instance exists
      { data: null },               // course not found in moodle_courses
    ]);
    mockCreateAdminClient.mockReturnValue(mock);

    const result = await compareCourses('moodle.example.com', scrapedCourses, 'user-1');

    expect(result).toEqual([
      {
        moodleCourseId: 'CS101',
        name: 'Intro to CS',
        moodleUrl: 'https://moodle.example.com/course/view.php?id=101',
        status: 'new_to_system',
      },
    ]);
  });

  it('returns synced_by_others when course exists but user has no sync record', async () => {
    const mock = createMockAdmin([
      { data: { id: 'inst-1' } },         // instance exists
      { data: { id: 'course-uuid-1' } },  // course exists in registry
      { data: null },                      // no user_course_syncs record
    ]);
    mockCreateAdminClient.mockReturnValue(mock);

    const result = await compareCourses('moodle.example.com', scrapedCourses, 'user-1');

    expect(result).toEqual([
      {
        moodleCourseId: 'CS101',
        name: 'Intro to CS',
        moodleUrl: 'https://moodle.example.com/course/view.php?id=101',
        status: 'synced_by_others',
        registryId: 'course-uuid-1',
      },
    ]);
  });

  it('returns synced_by_user when course exists and user has a sync record', async () => {
    const mock = createMockAdmin([
      { data: { id: 'inst-1' } },         // instance exists
      { data: { id: 'course-uuid-1' } },  // course exists in registry
      {
        data: {
          id: 'sync-1',
          last_synced_at: '2026-03-10T12:00:00Z',
        },
      }, // user has sync record
    ]);
    mockCreateAdminClient.mockReturnValue(mock);

    const result = await compareCourses('moodle.example.com', scrapedCourses, 'user-1');

    expect(result).toEqual([
      {
        moodleCourseId: 'CS101',
        name: 'Intro to CS',
        moodleUrl: 'https://moodle.example.com/course/view.php?id=101',
        status: 'synced_by_user',
        registryId: 'course-uuid-1',
        lastSyncedAt: '2026-03-10T12:00:00Z',
      },
    ]);
  });

  it('handles multiple courses with different statuses', async () => {
    const multiCourses = [
      {
        moodleCourseId: 'CS101',
        name: 'Intro to CS',
        url: 'https://moodle.example.com/course/view.php?id=101',
      },
      {
        moodleCourseId: 'CS201',
        name: 'Data Structures',
        url: 'https://moodle.example.com/course/view.php?id=201',
      },
      {
        moodleCourseId: 'CS301',
        name: 'Algorithms',
        url: 'https://moodle.example.com/course/view.php?id=301',
      },
    ];

    const mock = createMockAdmin([
      { data: { id: 'inst-1' } },         // instance exists
      { data: null },                      // CS101: not in registry
      { data: { id: 'course-uuid-2' } },  // CS201: in registry
      { data: null },                      // CS201: no user sync
      { data: { id: 'course-uuid-3' } },  // CS301: in registry
      {
        data: {
          id: 'sync-3',
          last_synced_at: '2026-03-09T08:00:00Z',
        },
      }, // CS301: user has sync
    ]);
    mockCreateAdminClient.mockReturnValue(mock);

    const result = await compareCourses('moodle.example.com', multiCourses, 'user-1');

    expect(result).toHaveLength(3);
    expect(result[0].status).toBe('new_to_system');
    expect(result[1].status).toBe('synced_by_others');
    expect(result[1].registryId).toBe('course-uuid-2');
    expect(result[2].status).toBe('synced_by_user');
    expect(result[2].registryId).toBe('course-uuid-3');
    expect(result[2].lastSyncedAt).toBe('2026-03-09T08:00:00Z');
  });
});

// ============================================
// T050: detectChanges tests
// ============================================

describe('detectChanges', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('detects new files that are in scraped data but not in registry', async () => {
    // Registry has one section with one file; scraped data has an extra file
    const mock = createExtendedMockAdmin({
      queryResults: [
        // 1st query: fetch sections for courseId (order terminates)
        {
          data: [
            { id: 'sec-uuid-1', moodle_section_id: 'sec-1' },
          ],
        },
        // 2nd query: fetch files for sec-uuid-1 (order terminates)
        {
          data: [
            {
              id: 'file-uuid-1',
              moodle_url: 'https://moodle.test/file1.pdf',
              file_name: 'file1.pdf',
              file_size: 1000,
              is_removed: false,
            },
          ],
        },
      ],
    });
    mockCreateAdminClient.mockReturnValue(mock);

    const result = await detectChanges('course-uuid-1', [
      {
        moodleSectionId: 'sec-1',
        title: 'Week 1',
        position: 0,
        items: [
          {
            type: 'file',
            name: 'file1.pdf',
            moodleUrl: 'https://moodle.test/file1.pdf',
            fileSize: 1000,
          },
          {
            type: 'file',
            name: 'file2.pdf',
            moodleUrl: 'https://moodle.test/file2.pdf',
            fileSize: 2000,
          },
        ],
      },
    ]);

    expect(result.newFiles).toHaveLength(1);
    expect(result.newFiles[0]).toEqual({
      sectionId: 'sec-1',
      moodleUrl: 'https://moodle.test/file2.pdf',
      name: 'file2.pdf',
      type: 'file',
    });
    expect(result.removedFiles).toHaveLength(0);
    expect(result.modifiedFiles).toHaveLength(0);
    expect(result.unchangedCount).toBe(1);
  });

  it('detects removed files that are in registry but not in scraped data', async () => {
    const mock = createExtendedMockAdmin({
      queryResults: [
        // sections
        {
          data: [
            { id: 'sec-uuid-1', moodle_section_id: 'sec-1' },
          ],
        },
        // files for sec-uuid-1: two files in registry
        {
          data: [
            {
              id: 'file-uuid-1',
              moodle_url: 'https://moodle.test/file1.pdf',
              file_name: 'file1.pdf',
              file_size: 1000,
              is_removed: false,
            },
            {
              id: 'file-uuid-2',
              moodle_url: 'https://moodle.test/file2.pdf',
              file_name: 'file2.pdf',
              file_size: 2000,
              is_removed: false,
            },
          ],
        },
      ],
    });
    mockCreateAdminClient.mockReturnValue(mock);

    // Scraped data only has file1 — file2 was removed from Moodle
    const result = await detectChanges('course-uuid-1', [
      {
        moodleSectionId: 'sec-1',
        title: 'Week 1',
        position: 0,
        items: [
          {
            type: 'file',
            name: 'file1.pdf',
            moodleUrl: 'https://moodle.test/file1.pdf',
            fileSize: 1000,
          },
        ],
      },
    ]);

    expect(result.removedFiles).toHaveLength(1);
    expect(result.removedFiles[0]).toEqual({
      fileId: 'file-uuid-2',
      fileName: 'file2.pdf',
    });
    expect(result.newFiles).toHaveLength(0);
    expect(result.modifiedFiles).toHaveLength(0);
    expect(result.unchangedCount).toBe(1);
  });

  it('detects modified files with same URL but different attributes', async () => {
    const mock = createExtendedMockAdmin({
      queryResults: [
        // sections
        {
          data: [
            { id: 'sec-uuid-1', moodle_section_id: 'sec-1' },
          ],
        },
        // files for sec-uuid-1
        {
          data: [
            {
              id: 'file-uuid-1',
              moodle_url: 'https://moodle.test/file1.pdf',
              file_name: 'file1.pdf',
              file_size: 1000,
              is_removed: false,
            },
          ],
        },
      ],
    });
    mockCreateAdminClient.mockReturnValue(mock);

    // Same URL but different name and fileSize
    const result = await detectChanges('course-uuid-1', [
      {
        moodleSectionId: 'sec-1',
        title: 'Week 1',
        position: 0,
        items: [
          {
            type: 'file',
            name: 'file1-updated.pdf',
            moodleUrl: 'https://moodle.test/file1.pdf',
            fileSize: 5000,
          },
        ],
      },
    ]);

    expect(result.modifiedFiles).toHaveLength(1);
    expect(result.modifiedFiles[0]).toEqual({
      fileId: 'file-uuid-1',
      fileName: 'file1-updated.pdf',
      moodleUrl: 'https://moodle.test/file1.pdf',
    });
    expect(result.newFiles).toHaveLength(0);
    expect(result.removedFiles).toHaveLength(0);
    expect(result.unchangedCount).toBe(0);
  });

  it('reports no changes when scraped data matches registry exactly', async () => {
    const mock = createExtendedMockAdmin({
      queryResults: [
        // sections
        {
          data: [
            { id: 'sec-uuid-1', moodle_section_id: 'sec-1' },
          ],
        },
        // files
        {
          data: [
            {
              id: 'file-uuid-1',
              moodle_url: 'https://moodle.test/file1.pdf',
              file_name: 'file1.pdf',
              file_size: 1000,
              is_removed: false,
            },
            {
              id: 'file-uuid-2',
              moodle_url: 'https://moodle.test/file2.pdf',
              file_name: 'file2.pdf',
              file_size: 2000,
              is_removed: false,
            },
          ],
        },
      ],
    });
    mockCreateAdminClient.mockReturnValue(mock);

    const result = await detectChanges('course-uuid-1', [
      {
        moodleSectionId: 'sec-1',
        title: 'Week 1',
        position: 0,
        items: [
          {
            type: 'file',
            name: 'file1.pdf',
            moodleUrl: 'https://moodle.test/file1.pdf',
            fileSize: 1000,
          },
          {
            type: 'file',
            name: 'file2.pdf',
            moodleUrl: 'https://moodle.test/file2.pdf',
            fileSize: 2000,
          },
        ],
      },
    ]);

    expect(result.newFiles).toHaveLength(0);
    expect(result.removedFiles).toHaveLength(0);
    expect(result.modifiedFiles).toHaveLength(0);
    expect(result.unchangedCount).toBe(2);
  });

  it('handles multiple sections with mixed changes', async () => {
    const mock = createExtendedMockAdmin({
      queryResults: [
        // sections for the course
        {
          data: [
            { id: 'sec-uuid-1', moodle_section_id: 'sec-1' },
            { id: 'sec-uuid-2', moodle_section_id: 'sec-2' },
          ],
        },
        // files for sec-uuid-1
        {
          data: [
            {
              id: 'file-uuid-1',
              moodle_url: 'https://moodle.test/file1.pdf',
              file_name: 'file1.pdf',
              file_size: 1000,
              is_removed: false,
            },
          ],
        },
        // files for sec-uuid-2
        {
          data: [
            {
              id: 'file-uuid-2',
              moodle_url: 'https://moodle.test/old-file.pdf',
              file_name: 'old-file.pdf',
              file_size: 500,
              is_removed: false,
            },
          ],
        },
      ],
    });
    mockCreateAdminClient.mockReturnValue(mock);

    const result = await detectChanges('course-uuid-1', [
      {
        moodleSectionId: 'sec-1',
        title: 'Week 1',
        position: 0,
        items: [
          {
            type: 'file',
            name: 'file1.pdf',
            moodleUrl: 'https://moodle.test/file1.pdf',
            fileSize: 1000,
          },
          {
            type: 'link',
            name: 'New Link',
            moodleUrl: 'https://moodle.test/new-link',
          },
        ],
      },
      {
        moodleSectionId: 'sec-2',
        title: 'Week 2',
        position: 1,
        items: [], // old-file.pdf was removed
      },
    ]);

    expect(result.unchangedCount).toBe(1); // file1.pdf
    expect(result.newFiles).toHaveLength(1); // new-link
    expect(result.newFiles[0].name).toBe('New Link');
    expect(result.removedFiles).toHaveLength(1); // old-file.pdf
    expect(result.removedFiles[0].fileName).toBe('old-file.pdf');
    expect(result.modifiedFiles).toHaveLength(0);
  });

  it('skips already-removed files when detecting removals', async () => {
    const mock = createExtendedMockAdmin({
      queryResults: [
        // sections
        {
          data: [
            { id: 'sec-uuid-1', moodle_section_id: 'sec-1' },
          ],
        },
        // files: one is already flagged as removed
        {
          data: [
            {
              id: 'file-uuid-1',
              moodle_url: 'https://moodle.test/file1.pdf',
              file_name: 'file1.pdf',
              file_size: 1000,
              is_removed: true, // already removed
            },
          ],
        },
      ],
    });
    mockCreateAdminClient.mockReturnValue(mock);

    // Scraped data has no items in this section
    const result = await detectChanges('course-uuid-1', [
      {
        moodleSectionId: 'sec-1',
        title: 'Week 1',
        position: 0,
        items: [],
      },
    ]);

    // Should NOT include already-removed files in removedFiles
    expect(result.removedFiles).toHaveLength(0);
    expect(result.unchangedCount).toBe(0);
  });
});

// ============================================
// T052: flagRemovedFiles tests
// ============================================

describe('flagRemovedFiles', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('updates moodle_files and user_file_imports for given file IDs', async () => {
    const mock = createExtendedMockAdmin({
      updateResults: [
        { data: null, error: null }, // moodle_files update
        { data: null, error: null }, // user_file_imports update
      ],
    });
    mockCreateAdminClient.mockReturnValue(mock);

    await flagRemovedFiles(['file-1', 'file-2']);

    // Should call .from() twice: once for moodle_files, once for user_file_imports
    expect(mock.from).toHaveBeenCalledWith('moodle_files');
    expect(mock.from).toHaveBeenCalledWith('user_file_imports');
    expect(mock.update).toHaveBeenCalledTimes(2);
    expect(mock.update).toHaveBeenCalledWith({ is_removed: true });
    expect(mock.update).toHaveBeenCalledWith({ status: 'removed_from_moodle' });
    expect(mock.in).toHaveBeenCalledWith('id', ['file-1', 'file-2']);
    expect(mock.in).toHaveBeenCalledWith('moodle_file_id', ['file-1', 'file-2']);
  });

  it('does nothing when given an empty array', async () => {
    const mock = createExtendedMockAdmin({});
    mockCreateAdminClient.mockReturnValue(mock);

    await flagRemovedFiles([]);

    expect(mock.from).not.toHaveBeenCalled();
  });
});

// ============================================
// T053: updateModifiedFile tests
// ============================================

describe('updateModifiedFile', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('updates moodle_files with provided fields', async () => {
    const mock = createExtendedMockAdmin({
      queryResults: [
        // Fetch current file to check old storage_path
        { data: { id: 'file-1', storage_path: null } },
      ],
      updateResults: [
        { data: null, error: null }, // moodle_files update
      ],
    });
    mockCreateAdminClient.mockReturnValue(mock);

    await updateModifiedFile('file-1', {
      fileName: 'updated.pdf',
      fileSize: 5000,
    });

    expect(mock.from).toHaveBeenCalledWith('moodle_files');
    expect(mock.update).toHaveBeenCalledWith({
      file_name: 'updated.pdf',
      file_size: 5000,
    });
  });

  it('deletes old storage file when storage_path changes', async () => {
    const mock = createExtendedMockAdmin({
      queryResults: [
        // Current file has an old storage_path
        { data: { id: 'file-1', storage_path: 'old/path/file.pdf' } },
      ],
      updateResults: [
        { data: null, error: null }, // moodle_files update
      ],
      storageRemoveResult: { data: null, error: null },
    });
    mockCreateAdminClient.mockReturnValue(mock);

    await updateModifiedFile('file-1', {
      storagePath: 'new/path/file.pdf',
      fileSize: 8000,
    });

    // Should have called storage.from('moodle-materials').remove(['old/path/file.pdf'])
    const storageMock = (mock as Record<string, unknown>).storage as Record<string, ReturnType<typeof vi.fn>>;
    expect(storageMock.from).toHaveBeenCalledWith('moodle-materials');
    expect(storageMock.remove).toHaveBeenCalledWith(['old/path/file.pdf']);
  });

  it('does not delete storage when there is no old storage_path', async () => {
    const mock = createExtendedMockAdmin({
      queryResults: [
        { data: { id: 'file-1', storage_path: null } },
      ],
      updateResults: [
        { data: null, error: null },
      ],
    });
    mockCreateAdminClient.mockReturnValue(mock);

    await updateModifiedFile('file-1', {
      storagePath: 'new/path/file.pdf',
    });

    const storageMock = (mock as Record<string, unknown>).storage as Record<string, ReturnType<typeof vi.fn>>;
    expect(storageMock.remove).not.toHaveBeenCalled();
  });
});
