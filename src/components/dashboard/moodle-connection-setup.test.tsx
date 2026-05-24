import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/hooks/use-moodle-extension', () => ({
  useMoodleExtension: vi.fn(),
  MINIMUM_EXTENSION_VERSION: '0.2.0',
}));

vi.mock('@/lib/actions/moodle-sync', () => ({
  saveMoodleConnection: vi.fn(),
  removeMoodleConnection: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import {
  useMoodleExtension,
  type ExtensionState,
} from '@/hooks/use-moodle-extension';
import { MoodleConnectionSetup } from './moodle-connection-setup';
import { saveMoodleConnection } from '@/lib/actions/moodle-sync';

const mockUseMoodleExtension = useMoodleExtension as ReturnType<typeof vi.fn>;

function mockExtension(
  state: ExtensionState,
  overrides: {
    requestPermission?: ReturnType<typeof vi.fn>;
    checkPermission?: ReturnType<typeof vi.fn>;
  } = {},
) {
  mockUseMoodleExtension.mockReturnValue({
    state,
    isInstalled: state.status === 'installed',
    isChecking: state.status === 'checking',
    requestPermission:
      overrides.requestPermission ?? vi.fn().mockResolvedValue(true),
    checkPermission:
      overrides.checkPermission ?? vi.fn().mockResolvedValue(true),
    ping: vi.fn(),
    checkMoodleLogin: vi.fn(),
    scrapeCourses: vi.fn(),
    scrapeCourseContent: vi.fn(),
    downloadAndUpload: vi.fn(),
  });
}

describe('MoodleConnectionSetup', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('renders nothing while the extension is still being checked', () => {
    mockExtension({ status: 'checking' });
    const { container } = render(<MoodleConnectionSetup />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when the extension is not installed', () => {
    mockExtension({ status: 'not-installed' });
    const { container } = render(<MoodleConnectionSetup />);
    expect(container.firstChild).toBeNull();
  });

  it('shows URL input when extension is installed and no connection saved', () => {
    mockExtension({ status: 'installed', version: '0.2.0' });
    render(<MoodleConnectionSetup />);
    expect(screen.getByLabelText(/moodle url/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /connect/i }),
    ).toBeInTheDocument();
  });

  it('shows current connection when one is provided', () => {
    mockExtension({ status: 'installed', version: '0.2.0' });
    render(
      <MoodleConnectionSetup
        currentConnection={{ domain: 'moodle.test.ac.il', instanceId: '123' }}
      />,
    );
    expect(screen.getByText(/moodle\.test\.ac\.il/i)).toBeInTheDocument();
    expect(screen.getByText(/disconnect/i)).toBeInTheDocument();
  });

  it('calls requestPermission with the Moodle origin on Connect', async () => {
    const requestPermission = vi.fn().mockResolvedValue(true);
    mockExtension(
      { status: 'installed', version: '0.2.0' },
      { requestPermission },
    );
    vi.mocked(saveMoodleConnection).mockResolvedValue(undefined);

    render(<MoodleConnectionSetup />);
    await userEvent.type(
      screen.getByLabelText(/moodle url/i),
      'https://moodle.test.ac.il',
    );
    await userEvent.click(screen.getByRole('button', { name: /connect/i }));

    await waitFor(() => {
      expect(requestPermission).toHaveBeenCalledWith(
        'https://moodle.test.ac.il',
      );
    });
    expect(saveMoodleConnection).toHaveBeenCalledWith('moodle.test.ac.il');
  });

  it('shows permission-required error when the user denies the Chrome prompt', async () => {
    const requestPermission = vi.fn().mockResolvedValue(false);
    mockExtension(
      { status: 'installed', version: '0.2.0' },
      { requestPermission },
    );

    render(<MoodleConnectionSetup />);
    await userEvent.type(
      screen.getByLabelText(/moodle url/i),
      'https://moodle.test.ac.il',
    );
    await userEvent.click(screen.getByRole('button', { name: /connect/i }));

    await waitFor(() => expect(requestPermission).toHaveBeenCalled());
    expect(saveMoodleConnection).not.toHaveBeenCalled();
    expect(screen.getByText(/permission required/i)).toBeInTheDocument();
  });

  it('renders the Grant Access banner when an existing connection lacks permission', async () => {
    const checkPermission = vi.fn().mockResolvedValue(false);
    mockExtension(
      { status: 'installed', version: '0.2.0' },
      { checkPermission },
    );

    render(
      <MoodleConnectionSetup
        currentConnection={{ domain: 'moodle.test.ac.il', instanceId: '123' }}
      />,
    );

    await waitFor(() => {
      expect(checkPermission).toHaveBeenCalledWith('https://moodle.test.ac.il');
    });
    expect(
      screen.getByRole('button', {
        name: /grant access to moodle\.test\.ac\.il/i,
      }),
    ).toBeInTheDocument();
  });
});
