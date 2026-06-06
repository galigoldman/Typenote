import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockInsert = vi.fn();
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: () => ({ insert: mockInsert }),
  })),
}));

import { recordAiEvent } from '@/lib/ai/usage-events';

beforeEach(() => {
  mockInsert.mockReset();
  mockInsert.mockResolvedValue({ error: null });
});

describe('recordAiEvent', () => {
  it('inserts a row with the full payload', async () => {
    await recordAiEvent({
      userId: 'u1',
      queryType: 'chat',
      model: 'flash',
      inputTokens: 100,
      outputTokens: 50,
      courseId: 'c1',
      documentId: 'd1',
    });
    expect(mockInsert).toHaveBeenCalledWith({
      user_id: 'u1',
      query_type: 'chat',
      model: 'flash',
      input_tokens: 100,
      output_tokens: 50,
      course_id: 'c1',
      document_id: 'd1',
    });
  });

  it('defaults course_id/document_id to null when omitted', async () => {
    await recordAiEvent({
      userId: 'u1',
      queryType: 'latex',
      model: 'flash',
      inputTokens: 1,
      outputTokens: 2,
    });
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ course_id: null, document_id: null }),
    );
  });

  it('never throws when the insert errors', async () => {
    mockInsert.mockResolvedValue({ error: { message: 'boom' } });
    await expect(
      recordAiEvent({
        userId: 'u1',
        queryType: 'embedding',
        model: 'embedding',
        inputTokens: 10,
        outputTokens: 0,
      }),
    ).resolves.toBeUndefined();
  });
});
