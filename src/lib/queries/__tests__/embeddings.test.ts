import { describe, expect, it, vi } from 'vitest';

const { rpc } = vi.hoisted(() => {
  const rpc = vi.fn().mockResolvedValue({ data: [], error: null });
  return { rpc };
});

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({ rpc }),
}));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));

import { matchEmbeddings } from '@/lib/queries/embeddings';

describe('matchEmbeddings sourceIds', () => {
  it('passes match_source_ids when sourceIds given', async () => {
    await matchEmbeddings({
      queryEmbedding: [0.1],
      userId: 'u1',
      courseId: 'c1',
      sourceIds: ['s1', 's2'],
    });
    expect(rpc).toHaveBeenCalledWith(
      'match_embeddings',
      expect.objectContaining({ match_source_ids: ['s1', 's2'] }),
    );
  });

  it('defaults match_source_ids to null', async () => {
    rpc.mockClear();
    await matchEmbeddings({ queryEmbedding: [0.1], userId: 'u1' });
    expect(rpc).toHaveBeenCalledWith(
      'match_embeddings',
      expect.objectContaining({ match_source_ids: null }),
    );
  });
});
