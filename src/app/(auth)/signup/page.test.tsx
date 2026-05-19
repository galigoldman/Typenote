import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import SignupPage from './page';

const mockSignInWithOAuth = vi.fn();

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      signInWithOAuth: mockSignInWithOAuth,
    },
  }),
}));

let mockSearchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => mockSearchParams,
}));

describe('SignupPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams();
  });

  // T001: Renders only Google button, no email/password form
  it('renders Google sign-up button', () => {
    render(<SignupPage />);
    expect(
      screen.getByRole('button', { name: /sign up with google/i }),
    ).toBeInTheDocument();
  });

  it('does NOT render email input', () => {
    render(<SignupPage />);
    expect(screen.queryByLabelText(/email/i)).not.toBeInTheDocument();
  });

  it('does NOT render password input', () => {
    render(<SignupPage />);
    expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument();
  });

  it('does NOT render display name input', () => {
    render(<SignupPage />);
    expect(screen.queryByLabelText(/display name/i)).not.toBeInTheDocument();
  });

  // T002: Shows error message when error query param is present
  it('shows error message when error query param is present', () => {
    mockSearchParams = new URLSearchParams('error=auth_failed');
    render(<SignupPage />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('does NOT show error message when no error param', () => {
    render(<SignupPage />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  // T003: Links to login page
  it('renders login link', () => {
    render(<SignupPage />);
    const link = screen.getByRole('link', { name: /sign in/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/login');
  });

  it('calls signInWithOAuth when Google button is clicked', () => {
    render(<SignupPage />);

    fireEvent.click(
      screen.getByRole('button', { name: /sign up with google/i }),
    );

    expect(mockSignInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: {
        redirectTo: expect.stringContaining('/auth/callback'),
      },
    });
  });
});
