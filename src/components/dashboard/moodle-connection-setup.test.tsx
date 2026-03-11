import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MoodleConnectionSetup } from './moodle-connection-setup';

// Mock the hook
vi.mock('@/hooks/use-moodle-extension', () => ({
  useMoodleExtension: vi.fn(),
}));

// Mock server actions
vi.mock('@/lib/actions/moodle-sync', () => ({
  saveMoodleConnection: vi.fn(),
  removeMoodleConnection: vi.fn(),
}));

// Mock sonner
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { useMoodleExtension } from '@/hooks/use-moodle-extension';

const mockUseMoodleExtension = useMoodleExtension as ReturnType<typeof vi.fn>;

describe('MoodleConnectionSetup', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('shows loading state while checking extension', () => {
    mockUseMoodleExtension.mockReturnValue({
      isInstalled: false,
      isChecking: true,
    });

    render(<MoodleConnectionSetup />);
    expect(screen.getByText(/checking/i)).toBeInTheDocument();
  });

  it('shows install prompt when extension not installed', () => {
    mockUseMoodleExtension.mockReturnValue({
      isInstalled: false,
      isChecking: false,
    });

    render(<MoodleConnectionSetup />);
    expect(screen.getByText(/extension required/i)).toBeInTheDocument();
  });

  it('shows URL input when extension is installed', () => {
    mockUseMoodleExtension.mockReturnValue({
      isInstalled: true,
      isChecking: false,
    });

    render(<MoodleConnectionSetup />);
    expect(screen.getByPlaceholderText(/moodle/i)).toBeInTheDocument();
    expect(screen.getByText(/connect/i)).toBeInTheDocument();
  });

  it('shows current connection when provided', () => {
    mockUseMoodleExtension.mockReturnValue({
      isInstalled: true,
      isChecking: false,
    });

    render(
      <MoodleConnectionSetup
        currentConnection={{ domain: 'moodle.test.ac.il', instanceId: '123' }}
      />,
    );
    expect(screen.getByText(/moodle\.test\.ac\.il/i)).toBeInTheDocument();
    expect(screen.getByText(/disconnect/i)).toBeInTheDocument();
  });
});
