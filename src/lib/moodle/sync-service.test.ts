import { describe, it, expect, vi, beforeEach } from 'vitest';
import { compareCourses } from './sync-service';

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
