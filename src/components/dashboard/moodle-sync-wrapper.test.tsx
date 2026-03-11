import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MoodleSyncWrapper } from './moodle-sync-wrapper';

// Mock child components to isolate wrapper logic
vi.mock('./moodle-sync-prompt', () => ({
  MoodleSyncPrompt: ({
    onSyncClick,
    moodleConnection,
  }: {
    onSyncClick: () => void;
    moodleConnection: unknown;
  }) => (
    <div data-testid="sync-prompt">
      <span>{moodleConnection ? 'connected' : 'disconnected'}</span>
      <button onClick={onSyncClick}>Sync with Moodle</button>
    </div>
  ),
}));

vi.mock('./moodle-sync-dialog', () => ({
  MoodleSyncDialog: ({
    open,
    onOpenChange,
  }: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
  }) =>
    open ? (
      <div data-testid="sync-dialog">
        <span>Dialog Open</span>
        <button onClick={() => onOpenChange(false)}>Close Dialog</button>
      </div>
    ) : null,
}));

const mockConnection = { domain: 'moodle.test.ac.il', instanceId: 'inst-123' };

describe('MoodleSyncWrapper', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('renders MoodleSyncPrompt', () => {
    render(<MoodleSyncWrapper moodleConnection={mockConnection} />);
    expect(screen.getByTestId('sync-prompt')).toBeInTheDocument();
  });

  it('does not render sync dialog initially', () => {
    render(<MoodleSyncWrapper moodleConnection={mockConnection} />);
    expect(screen.queryByTestId('sync-dialog')).not.toBeInTheDocument();
  });

  it('opens sync dialog when sync button is clicked', async () => {
    const user = userEvent.setup();
    render(<MoodleSyncWrapper moodleConnection={mockConnection} />);

    await user.click(screen.getByRole('button', { name: /sync with moodle/i }));

    expect(screen.getByTestId('sync-dialog')).toBeInTheDocument();
    expect(screen.getByText('Dialog Open')).toBeInTheDocument();
  });

  it('closes sync dialog when close button is clicked', async () => {
    const user = userEvent.setup();
    render(<MoodleSyncWrapper moodleConnection={mockConnection} />);

    // Open dialog
    await user.click(screen.getByRole('button', { name: /sync with moodle/i }));
    expect(screen.getByTestId('sync-dialog')).toBeInTheDocument();

    // Close dialog
    await user.click(screen.getByRole('button', { name: /close dialog/i }));
    await waitFor(() => {
      expect(screen.queryByTestId('sync-dialog')).not.toBeInTheDocument();
    });
  });

  it('does not render sync dialog when no connection', () => {
    render(<MoodleSyncWrapper moodleConnection={null} />);
    expect(screen.getByText('disconnected')).toBeInTheDocument();
    // Even if we hypothetically could click, dialog shouldn't be rendered
    expect(screen.queryByTestId('sync-dialog')).not.toBeInTheDocument();
  });
});
