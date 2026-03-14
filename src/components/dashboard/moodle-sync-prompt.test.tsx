import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MoodleSyncPrompt } from './moodle-sync-prompt';

// Mock the hook
vi.mock('@/hooks/use-moodle-extension', () => ({
  useMoodleExtension: vi.fn(),
}));

// Mock the MoodleConnectionSetup component (avoids needing to mock its server action imports)
vi.mock('./moodle-connection-setup', () => ({
  MoodleConnectionSetup: () => (
    <div data-testid="moodle-connection-setup">Moodle Connection Setup</div>
  ),
}));

import { useMoodleExtension } from '@/hooks/use-moodle-extension';

const mockUseMoodleExtension = useMoodleExtension as ReturnType<typeof vi.fn>;

const mockConnection = { domain: 'moodle.test.ac.il', instanceId: 'inst-123' };

describe('MoodleSyncPrompt', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('renders nothing while checking extension', () => {
    mockUseMoodleExtension.mockReturnValue({
      isInstalled: false,
      isChecking: true,
      checkMoodleLogin: vi.fn(),
    });

    const { container } = render(
      <MoodleSyncPrompt moodleConnection={null} onSyncClick={vi.fn()} />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('shows install message when extension is not installed', () => {
    mockUseMoodleExtension.mockReturnValue({
      isInstalled: false,
      isChecking: false,
      checkMoodleLogin: vi.fn(),
    });

    render(<MoodleSyncPrompt moodleConnection={null} onSyncClick={vi.fn()} />);
    expect(
      screen.getByText(/install the typenote browser extension/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/install extension/i)).toBeInTheDocument();
  });

  it('shows setup message when extension is installed but no connection', () => {
    mockUseMoodleExtension.mockReturnValue({
      isInstalled: true,
      isChecking: false,
    });

    render(<MoodleSyncPrompt moodleConnection={null} onSyncClick={vi.fn()} />);
    expect(
      screen.getByText(/enter your moodle url to start syncing courses/i),
    ).toBeInTheDocument();
    expect(screen.getByTestId('moodle-connection-setup')).toBeInTheDocument();
  });

  it('shows sync button immediately when extension is installed and connection exists', () => {
    mockUseMoodleExtension.mockReturnValue({
      isInstalled: true,
      isChecking: false,
    });

    render(
      <MoodleSyncPrompt
        moodleConnection={mockConnection}
        onSyncClick={vi.fn()}
      />,
    );

    expect(screen.getByText(/connected to/i)).toBeInTheDocument();
    expect(screen.getByText('moodle.test.ac.il')).toBeInTheDocument();
    expect(screen.getByText(/sync with moodle/i)).toBeInTheDocument();
  });

  it('shows sync button when extension is installed, connection exists, and logged in', async () => {
    const mockCheckLogin = vi.fn().mockResolvedValue({ loggedIn: true });
    mockUseMoodleExtension.mockReturnValue({
      isInstalled: true,
      isChecking: false,
      checkMoodleLogin: mockCheckLogin,
    });

    render(
      <MoodleSyncPrompt
        moodleConnection={mockConnection}
        onSyncClick={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/sync with moodle/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/connected to/i)).toBeInTheDocument();
    expect(screen.getByText('moodle.test.ac.il')).toBeInTheDocument();
  });

  it('calls onSyncClick when sync button is clicked', async () => {
    const mockCheckLogin = vi.fn().mockResolvedValue({ loggedIn: true });
    const onSyncClick = vi.fn();
    mockUseMoodleExtension.mockReturnValue({
      isInstalled: true,
      isChecking: false,
      checkMoodleLogin: mockCheckLogin,
    });

    render(
      <MoodleSyncPrompt
        moodleConnection={mockConnection}
        onSyncClick={onSyncClick}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/sync with moodle/i)).toBeInTheDocument();
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /sync with moodle/i }));
    expect(onSyncClick).toHaveBeenCalledOnce();
  });
});
