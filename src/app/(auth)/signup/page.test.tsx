import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import SignupPage from './page';

const mockPush = vi.fn();
const mockRefresh = vi.fn();
const mockSignUp = vi.fn();
const mockSignInWithOAuth = vi.fn();

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      signInWithPassword: vi.fn(),
      signInWithOAuth: mockSignInWithOAuth,
      signUp: mockSignUp,
    },
  }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
}));

describe('SignupPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders display name input', () => {
    render(<SignupPage />);
    expect(screen.getByLabelText(/display name/i)).toBeInTheDocument();
  });

  it('renders email input', () => {
    render(<SignupPage />);
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
  });

  it('renders password input', () => {
    render(<SignupPage />);
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
  });

  it('renders submit button', () => {
    render(<SignupPage />);
    expect(
      screen.getByRole('button', { name: /sign up/i }),
    ).toBeInTheDocument();
  });

  it('renders Google button', () => {
    render(<SignupPage />);
    expect(screen.getByRole('button', { name: /google/i })).toBeInTheDocument();
  });

  it('renders login link', () => {
    render(<SignupPage />);
    const link = screen.getByRole('link', { name: /sign in/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/login');
  });

  it('shows error message on failed signup', async () => {
    mockSignUp.mockResolvedValueOnce({
      error: { message: 'User already registered' },
    });

    render(<SignupPage />);

    fireEvent.change(screen.getByLabelText(/display name/i), {
      target: { value: 'Test User' },
    });
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'test@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: 'password123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /sign up/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'User already registered',
      );
    });
  });

  it('redirects to dashboard on successful signup', async () => {
    mockSignUp.mockResolvedValueOnce({ error: null });

    render(<SignupPage />);

    fireEvent.change(screen.getByLabelText(/display name/i), {
      target: { value: 'Test User' },
    });
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'test@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: 'password123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /sign up/i }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/dashboard');
      expect(mockRefresh).toHaveBeenCalled();
    });
  });

  it('calls signInWithOAuth when Google button is clicked', () => {
    render(<SignupPage />);

    fireEvent.click(screen.getByRole('button', { name: /google/i }));

    expect(mockSignInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: {
        redirectTo: expect.stringContaining('/auth/callback'),
      },
    });
  });
});
