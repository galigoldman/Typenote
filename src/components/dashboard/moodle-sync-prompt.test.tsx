import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ExtensionState } from '@/hooks/use-moodle-extension';

vi.mock('@/hooks/use-moodle-extension', () => ({
  useMoodleExtension: vi.fn(),
  EXPECTED_EXTENSION_VERSION: '0.2.0',
}));

import { useMoodleExtension } from '@/hooks/use-moodle-extension';
import { MoodleSyncPrompt } from './moodle-sync-prompt';

function setState(state: ExtensionState) {
  vi.mocked(useMoodleExtension).mockReturnValue({
    state,
    isInstalled: state.status === 'installed',
    isChecking: state.status === 'checking',
    ping: vi.fn(),
    checkPermission: vi.fn(),
    requestPermission: vi.fn(),
    checkMoodleLogin: vi.fn(),
    scrapeCourses: vi.fn(),
    scrapeCourseContent: vi.fn(),
    downloadAndUpload: vi.fn(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

beforeEach(() => vi.clearAllMocks());

describe('MoodleSyncPrompt', () => {
  it('renders the skeleton while extension is checking', () => {
    setState({ status: 'checking' });
    const { container } = render(
      <MoodleSyncPrompt moodleConnection={null} onSyncClick={() => {}} />,
    );
    expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument();
  });

  it('renders the Install card with an enabled trigger when extension is not installed', () => {
    setState({ status: 'not-installed' });
    render(<MoodleSyncPrompt moodleConnection={null} onSyncClick={() => {}} />);
    expect(
      screen.getByText(/install the typenote extension/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /install extension/i }),
    ).toBeEnabled();
  });

  it('renders the Update card with both versions when version mismatches', () => {
    setState({ status: 'version-mismatch', installedVersion: '0.1.0' });
    render(<MoodleSyncPrompt moodleConnection={null} onSyncClick={() => {}} />);
    expect(
      screen.getByText(/update the typenote extension/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/0\.1\.0/)).toBeInTheDocument();
    expect(screen.getByText(/0\.2\.0/)).toBeInTheDocument();
  });

  it('renders the connection-setup card when extension is installed but not connected', () => {
    setState({ status: 'installed', version: '0.2.0' });
    render(<MoodleSyncPrompt moodleConnection={null} onSyncClick={() => {}} />);
    expect(screen.getByLabelText(/moodle url/i)).toBeInTheDocument();
  });

  it('renders the Sync button when extension is installed AND connected', () => {
    setState({ status: 'installed', version: '0.2.0' });
    render(
      <MoodleSyncPrompt
        moodleConnection={{ domain: 'moodle.test.ac.il', instanceId: 'abc' }}
        onSyncClick={() => {}}
      />,
    );
    expect(
      screen.getByRole('button', { name: /sync with moodle/i }),
    ).toBeInTheDocument();
  });
});
