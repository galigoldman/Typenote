import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import LoginPage from './page';

const mockPush = vi.fn();
const mockRefresh = vi.fn();
const mockSignInWithPassword = vi.fn();
const mockSignInWithGoogle = vi.fn();
let mockSearchParams = new URLSearchParams();

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      signInWithPassword: mockSignInWithPassword,
      signUp: vi.fn(),
    },
  }),
}));

vi.mock('@/lib/supabase/oauth', () => ({
  signInWithGoogle: (...args: unknown[]) => mockSignInWithGoogle(...args),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
  useSearchParams: () => mockSearchParams,
}));

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams();
  });

  it('renders email input', () => {
    render(<LoginPage />);
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
  });

  it('renders password input', () => {
    render(<LoginPage />);
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
  });

  it('renders submit button', () => {
    render(<LoginPage />);
    expect(
      screen.getByRole('button', { name: /sign in/i }),
    ).toBeInTheDocument();
  });

  it('renders Google button', () => {
    render(<LoginPage />);
    expect(screen.getByRole('button', { name: /google/i })).toBeInTheDocument();
  });

  it('renders signup link', () => {
    render(<LoginPage />);
    const link = screen.getByRole('link', { name: /sign up/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/signup');
  });

  it('renders "Forgot password?" link pointing to /forgot-password', () => {
    render(<LoginPage />);
    const link = screen.getByRole('link', { name: /forgot password/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/forgot-password');
  });

  it('sanitizes error messages (does not show raw Supabase errors)', async () => {
    mockSignInWithPassword.mockResolvedValueOnce({
      error: { message: 'Invalid login credentials' },
    });

    render(<LoginPage />);

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'test@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: 'wrongpassword' },
    });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Invalid email or password.',
      );
    });
  });

  it('redirects to dashboard on successful login', async () => {
    mockSignInWithPassword.mockResolvedValueOnce({ error: null });

    render(<LoginPage />);

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'test@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: 'correctpassword' },
    });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/dashboard');
      expect(mockRefresh).toHaveBeenCalled();
    });
  });

  it('calls signInWithGoogle helper when Google button is clicked', () => {
    render(<LoginPage />);

    fireEvent.click(screen.getByRole('button', { name: /google/i }));

    expect(mockSignInWithGoogle).toHaveBeenCalled();
  });

  it('shows success banner when ?message=password-reset-success', () => {
    mockSearchParams = new URLSearchParams('message=password-reset-success');

    render(<LoginPage />);

    expect(
      screen.getByText(/password reset successfully/i),
    ).toBeInTheDocument();
  });

  it('does not show success banner without query param', () => {
    mockSearchParams = new URLSearchParams();

    render(<LoginPage />);

    expect(
      screen.queryByText(/password reset successfully/i),
    ).not.toBeInTheDocument();
  });
});
