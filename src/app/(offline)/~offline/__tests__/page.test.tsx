import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import OfflinePage from '../page';

describe('Offline fallback page', () => {
  it('renders a heading indicating offline status', () => {
    render(<OfflinePage />);
    expect(
      screen.getByRole('heading', { name: /offline/i })
    ).toBeInTheDocument();
  });

  it('renders a message asking the user to check their connection', () => {
    render(<OfflinePage />);
    expect(screen.getByText(/check your internet connection/i)).toBeInTheDocument();
  });

  it('renders a retry button', () => {
    render(<OfflinePage />);
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });
});
