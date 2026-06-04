import { describe, it, expect, vi, beforeEach } from 'vitest';

const { notFound, getUser, from } = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
  getUser: vi.fn(),
  from: vi.fn(),
}));
vi.mock('next/navigation', () => ({ notFound }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser }, from })),
}));

import { requireAdmin } from '../require-admin';

function mockProfile(is_admin: boolean | null) {
  from.mockReturnValue({
    select: () => ({
      eq: () => ({
        single: async () => ({ data: is_admin === null ? null : { is_admin }, error: null }),
      }),
    }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('requireAdmin', () => {
  it('returns the user id for an admin', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } });
    mockProfile(true);
    await expect(requireAdmin()).resolves.toBe('admin-1');
    expect(notFound).not.toHaveBeenCalled();
  });

  it('calls notFound for a logged-in non-admin', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mockProfile(false);
    await expect(requireAdmin()).rejects.toThrow('NEXT_NOT_FOUND');
    expect(notFound).toHaveBeenCalled();
  });

  it('calls notFound when unauthenticated', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    await expect(requireAdmin()).rejects.toThrow('NEXT_NOT_FOUND');
    expect(notFound).toHaveBeenCalled();
  });
});
