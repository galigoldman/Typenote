import { describe, it, expect, vi, beforeEach } from 'vitest';
import { upsertAssignment, flagRemovedAssignments } from './assignment-sync';

// Mock the admin client
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}));

import { createAdminClient } from '@/lib/supabase/admin';

const mockCreateAdminClient = createAdminClient as ReturnType<typeof vi.fn>;

/**
 * Build a chainable mock Supabase admin client suited to assignment-sync queries.
 *
 * Design:
 * - .select/.eq/.single chains pop results from queryResults queue.
 * - .insert().select().single() pops from insertResults queue.
 * - .update().eq().select().single() (contentChanged path) pops from updateSelectResults queue.
 * - .update().in() (flagRemoved path) resolves void from updateVoidResults queue.
 *
 * We track "mode" via flags set when .insert() or .update() is called so
 * the terminal .single() / .in() knows which queue to read from.
 */
function createAssignmentMockAdmin(opts: {
  queryResults?: Array<{ data: unknown; error?: unknown }>;
  insertResults?: Array<{ data: unknown; error?: unknown }>;
  updateSelectResults?: Array<{ data: unknown; error?: unknown }>;
  updateVoidResults?: Array<{ data: null; error: null }>;
}) {
  let queryIndex = 0;
  let insertIndex = 0;
  let updateSelectIndex = 0;
  let updateVoidIndex = 0;

  type Mode = 'select' | 'insert' | 'updateSelect' | 'updateVoid';
  let mode: Mode = 'select';

  const queries = opts.queryResults ?? [];
  const inserts = opts.insertResults ?? [];
  const updateSelects = opts.updateSelectResults ?? [];
  const updateVoids = opts.updateVoidResults ?? [];

  const chain: Record<string, ReturnType<typeof vi.fn>> = {};

  chain.from = vi.fn().mockImplementation(() => {
    mode = 'select';
    return chain;
  });

  chain.select = vi.fn().mockReturnValue(chain);

  chain.eq = vi.fn().mockImplementation(() => {
    // In updateSelect mode the first .eq() (after .update()) keeps chaining;
    // the second .eq() (after .select()) is the terminal call.
    // We detect terminal by checking if we are already in updateSelect mode
    // and a .select() was called after .update().
    // Simplification: .eq() always keeps chaining — .single() is always terminal.
    return chain;
  });

  chain.in = vi.fn().mockImplementation(() => {
    // Terminal call for flagRemovedAssignments update path
    const result = updateVoids[updateVoidIndex] ?? { data: null, error: null };
    updateVoidIndex++;
    return Promise.resolve(result);
  });

  chain.single = vi.fn().mockImplementation(() => {
    if (mode === 'insert') {
      const result = inserts[insertIndex] ?? { data: null, error: null };
      insertIndex++;
      mode = 'select';
      return Promise.resolve(result);
    }
    if (mode === 'updateSelect') {
      const result =
        updateSelects[updateSelectIndex] ?? { data: null, error: null };
      updateSelectIndex++;
      mode = 'select';
      return Promise.resolve(result);
    }
    // Default: select query
    const result = queries[queryIndex] ?? { data: null, error: null };
    queryIndex++;
    return Promise.resolve(result);
  });

  chain.insert = vi.fn().mockImplementation(() => {
    mode = 'insert';
    return chain;
  });

  chain.update = vi.fn().mockImplementation(() => {
    // Distinguish between update→select→single (contentChanged) and update→in (flagRemoved).
    // We optimistically set to updateSelect; .in() overrides the resolution to updateVoid queue.
    mode = 'updateSelect';
    return chain;
  });

  return chain;
}

// ============================================
// upsertAssignment tests
// ============================================

describe('upsertAssignment', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  const baseParams = {
    sectionId: 'sec-uuid-1',
    moodleUrl: 'https://moodle.example.com/mod/assign/view.php?id=42',
    moodleModuleId: '42',
    title: 'Week 1 Assignment',
    descriptionHtml: '<p>Submit your essay.</p>',
    dueDate: '2026-04-01T23:59:00Z',
  };

  it('creates a new assignment when none exists', async () => {
    const mock = createAssignmentMockAdmin({
      queryResults: [
        // lookup: no existing record
        { data: null, error: null },
      ],
      insertResults: [
        // insert result
        { data: { id: 'assign-uuid-1', content_version: 1 }, error: null },
      ],
    });
    mockCreateAdminClient.mockReturnValue(mock);

    const result = await upsertAssignment(baseParams);

    expect(result).toEqual({
      assignmentId: 'assign-uuid-1',
      isNew: true,
      contentChanged: false,
      filesToDownload: [],
    });
    expect(mock.insert).toHaveBeenCalledTimes(1);
    expect(mock.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        section_id: 'sec-uuid-1',
        moodle_url: baseParams.moodleUrl,
        moodle_module_id: '42',
        title: 'Week 1 Assignment',
        description_html: '<p>Submit your essay.</p>',
        due_date: '2026-04-01T23:59:00Z',
        is_removed: false,
      }),
    );
    expect(mock.update).not.toHaveBeenCalled();
  });

  it('updates the assignment and bumps content_version when description_html changed', async () => {
    const mock = createAssignmentMockAdmin({
      queryResults: [
        // lookup: existing record with old description
        {
          data: {
            id: 'assign-uuid-1',
            description_html: '<p>Old description.</p>',
            content_version: 1,
          },
          error: null,
        },
      ],
      updateSelectResults: [
        // update result
        { data: { id: 'assign-uuid-1', content_version: 2 }, error: null },
      ],
    });
    mockCreateAdminClient.mockReturnValue(mock);

    const result = await upsertAssignment({
      ...baseParams,
      descriptionHtml: '<p>New description.</p>',
    });

    expect(result).toEqual({
      assignmentId: 'assign-uuid-1',
      isNew: false,
      contentChanged: true,
      filesToDownload: [],
    });
    expect(mock.update).toHaveBeenCalledTimes(1);
    expect(mock.update).toHaveBeenCalledWith(
      expect.objectContaining({
        description_html: '<p>New description.</p>',
        content_version: 2, // 1 + 1
        is_removed: false,
      }),
    );
    expect(mock.insert).not.toHaveBeenCalled();
  });

  it('skips writes and returns contentChanged:false when description is unchanged', async () => {
    const mock = createAssignmentMockAdmin({
      queryResults: [
        // lookup: existing record with same description
        {
          data: {
            id: 'assign-uuid-1',
            description_html: '<p>Submit your essay.</p>',
            content_version: 3,
          },
          error: null,
        },
      ],
    });
    mockCreateAdminClient.mockReturnValue(mock);

    const result = await upsertAssignment(baseParams);

    expect(result).toEqual({
      assignmentId: 'assign-uuid-1',
      isNew: false,
      contentChanged: false,
      filesToDownload: [],
    });
    expect(mock.insert).not.toHaveBeenCalled();
    expect(mock.update).not.toHaveBeenCalled();
  });
});

// ============================================
// flagRemovedAssignments tests
// ============================================

describe('flagRemovedAssignments', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('flags assignments whose moodle_url is no longer in currentMoodleUrls', async () => {
    const mock = createAssignmentMockAdmin({
      queryResults: [
        // select existing non-removed assignments for section
        {
          data: [
            {
              id: 'assign-uuid-1',
              moodle_url: 'https://moodle.example.com/mod/assign/view.php?id=1',
            },
            {
              id: 'assign-uuid-2',
              moodle_url: 'https://moodle.example.com/mod/assign/view.php?id=2',
            },
          ],
          error: null,
        },
      ],
      updateVoidResults: [{ data: null, error: null }],
    });
    // flagRemovedAssignments uses .eq() chain (not .single()), so we need
    // the select to resolve from an order-like terminal. The function does:
    //   .select('id, moodle_url').eq('section_id', ...).eq('is_removed', false)
    // which returns the chainable object, not a promise — the data comes from
    // the final awaited chain. We need to adjust our mock so that the second
    // .eq() resolves the select query.
    //
    // Override: make the second eq() resolve the query result instead of chaining.
    let eqCallCount = 0;
    const queryData = {
      data: [
        {
          id: 'assign-uuid-1',
          moodle_url: 'https://moodle.example.com/mod/assign/view.php?id=1',
        },
        {
          id: 'assign-uuid-2',
          moodle_url: 'https://moodle.example.com/mod/assign/view.php?id=2',
        },
      ],
      error: null,
    };
    const updateVoidData = { data: null, error: null };

    const chain2: Record<string, ReturnType<typeof vi.fn>> = {};
    let inUpdateMode = false;

    chain2.from = vi.fn().mockImplementation(() => {
      inUpdateMode = false;
      eqCallCount = 0;
      return chain2;
    });
    chain2.select = vi.fn().mockReturnValue(chain2);
    chain2.eq = vi.fn().mockImplementation(() => {
      eqCallCount++;
      if (!inUpdateMode && eqCallCount >= 2) {
        // second eq() in select chain is terminal — return the promise
        return Promise.resolve(queryData);
      }
      if (inUpdateMode) {
        // eq() after update is terminal
        const result = updateVoidData;
        inUpdateMode = false;
        return Promise.resolve(result);
      }
      return chain2;
    });
    chain2.in = vi.fn().mockImplementation(() => {
      inUpdateMode = false;
      return Promise.resolve(updateVoidData);
    });
    chain2.update = vi.fn().mockImplementation(() => {
      inUpdateMode = true;
      return chain2;
    });
    chain2.single = vi.fn().mockResolvedValue({ data: null });

    mockCreateAdminClient.mockReturnValue(chain2);

    await flagRemovedAssignments('sec-uuid-1', [
      'https://moodle.example.com/mod/assign/view.php?id=1', // still present
    ]);

    // assign-uuid-2 was removed; assign-uuid-1 is still present
    expect(chain2.update).toHaveBeenCalledWith(
      expect.objectContaining({ is_removed: true }),
    );
    expect(chain2.in).toHaveBeenCalledWith('id', ['assign-uuid-2']);
  });

  it('does nothing when all assignments are still present', async () => {
    const url1 = 'https://moodle.example.com/mod/assign/view.php?id=1';
    const queryData = {
      data: [{ id: 'assign-uuid-1', moodle_url: url1 }],
      error: null,
    };

    let eqCallCount = 0;
    const chain2: Record<string, ReturnType<typeof vi.fn>> = {};

    chain2.from = vi.fn().mockImplementation(() => {
      eqCallCount = 0;
      return chain2;
    });
    chain2.select = vi.fn().mockReturnValue(chain2);
    chain2.eq = vi.fn().mockImplementation(() => {
      eqCallCount++;
      if (eqCallCount >= 2) {
        return Promise.resolve(queryData);
      }
      return chain2;
    });
    chain2.in = vi.fn().mockResolvedValue({ data: null, error: null });
    chain2.update = vi.fn().mockReturnValue(chain2);

    mockCreateAdminClient.mockReturnValue(chain2);

    await flagRemovedAssignments('sec-uuid-1', [url1]);

    expect(chain2.update).not.toHaveBeenCalled();
    expect(chain2.in).not.toHaveBeenCalled();
  });

  it('does nothing when the section has no existing assignments', async () => {
    const queryData = { data: null, error: null };

    let eqCallCount = 0;
    const chain2: Record<string, ReturnType<typeof vi.fn>> = {};

    chain2.from = vi.fn().mockImplementation(() => {
      eqCallCount = 0;
      return chain2;
    });
    chain2.select = vi.fn().mockReturnValue(chain2);
    chain2.eq = vi.fn().mockImplementation(() => {
      eqCallCount++;
      if (eqCallCount >= 2) {
        return Promise.resolve(queryData);
      }
      return chain2;
    });
    chain2.in = vi.fn().mockResolvedValue({ data: null, error: null });
    chain2.update = vi.fn().mockReturnValue(chain2);

    mockCreateAdminClient.mockReturnValue(chain2);

    await flagRemovedAssignments('sec-uuid-1', []);

    expect(chain2.update).not.toHaveBeenCalled();
    expect(chain2.in).not.toHaveBeenCalled();
  });
});
