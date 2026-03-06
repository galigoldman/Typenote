import { describe, it, expect, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}));

describe('Home page', () => {
  it('redirects to /dashboard', async () => {
    const { redirect } = await import('next/navigation');
    const { default: Home } = await import('./page');

    Home();

    expect(redirect).toHaveBeenCalledWith('/dashboard');
  });
});
