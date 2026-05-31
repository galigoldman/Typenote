import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MoodleSyncDialog } from './moodle-sync-dialog';
import type { CourseComparison } from '@/lib/moodle/sync-service';

// Mock the Supabase browser client (used by createClient in the component)
vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    },
  })),
}));

// Mock the extension hook
vi.mock('@/hooks/use-moodle-extension', () => ({
  useMoodleExtension: vi.fn(),
}));

// Mock server actions
vi.mock('@/lib/actions/moodle-sync', () => ({
  compareScrapedCourses: vi.fn(),
  syncMoodleCourses: vi.fn(),
  getExistingFileUrls: vi.fn().mockResolvedValue([]),
}));

import { useMoodleExtension } from '@/hooks/use-moodle-extension';
import {
  compareScrapedCourses,
  syncMoodleCourses,
} from '@/lib/actions/moodle-sync';

const mockUseMoodleExtension = useMoodleExtension as ReturnType<typeof vi.fn>;
const mockCompare = compareScrapedCourses as ReturnType<typeof vi.fn>;
const mockSync = syncMoodleCourses as ReturnType<typeof vi.fn>;

const mockConnection = { domain: 'moodle.test.ac.il', instanceId: 'inst-123' };

/**
 * Default hook mock: permission already granted so loadCourses falls through
 * straight to scraping. Tests that want to exercise the permission handshake
 * override `checkPermission`/`requestPermission` explicitly.
 */
function makeExtensionMock(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    scrapeCourses: vi.fn(),
    scrapeCourseContent: vi.fn(),
    downloadAndUpload: vi.fn(),
    requestPermission: vi.fn().mockResolvedValue({ granted: true }),
    checkPermission: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

const mockScrapedCourses = {
  courses: [
    {
      moodleCourseId: 'CS101',
      name: 'Intro to CS',
      url: 'https://moodle.test.ac.il/course/101',
    },
    {
      moodleCourseId: 'CS201',
      name: 'Data Structures',
      url: 'https://moodle.test.ac.il/course/201',
    },
  ],
};

const mockComparisons: CourseComparison[] = [
  {
    moodleCourseId: 'CS101',
    name: 'Intro to CS',
    moodleUrl: 'https://moodle.test.ac.il/course/101',
    status: 'new_to_system',
  },
  {
    moodleCourseId: 'CS201',
    name: 'Data Structures',
    moodleUrl: 'https://moodle.test.ac.il/course/201',
    status: 'synced_by_user',
    registryId: 'reg-201',
    lastSyncedAt: '2026-03-10T12:00:00Z',
  },
];

describe('MoodleSyncDialog', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('shows scraping message when dialog opens', () => {
    const mockScrape = vi.fn().mockReturnValue(new Promise(() => {})); // never resolves
    mockUseMoodleExtension.mockReturnValue(
      makeExtensionMock({ scrapeCourses: mockScrape }),
    );

    render(
      <MoodleSyncDialog
        open={true}
        onOpenChange={vi.fn()}
        moodleConnection={mockConnection}
      />,
    );

    expect(
      screen.getByText(/scanning moodle for courses/i),
    ).toBeInTheDocument();
  });

  it('shows course list after scraping and comparing', async () => {
    const mockScrape = vi.fn().mockResolvedValue(mockScrapedCourses);
    mockUseMoodleExtension.mockReturnValue(
      makeExtensionMock({ scrapeCourses: mockScrape }),
    );
    mockCompare.mockResolvedValue(mockComparisons);

    render(
      <MoodleSyncDialog
        open={true}
        onOpenChange={vi.fn()}
        moodleConnection={mockConnection}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Intro to CS')).toBeInTheDocument();
    });

    expect(screen.getByText('Data Structures')).toBeInTheDocument();
    expect(screen.getByText('New')).toBeInTheDocument();
    expect(screen.getByText('Synced')).toBeInTheDocument();
  });

  it('shows no courses message when scrape returns empty array', async () => {
    const mockScrape = vi.fn().mockResolvedValue({ courses: [] });
    mockUseMoodleExtension.mockReturnValue(
      makeExtensionMock({ scrapeCourses: mockScrape }),
    );

    render(
      <MoodleSyncDialog
        open={true}
        onOpenChange={vi.fn()}
        moodleConnection={mockConnection}
      />,
    );

    await waitFor(() => {
      expect(
        screen.getByText(/couldn't find any courses/i),
      ).toBeInTheDocument();
    });
  });

  it('pre-selects new_to_system courses and shows sync button', async () => {
    const mockScrape = vi.fn().mockResolvedValue(mockScrapedCourses);
    mockUseMoodleExtension.mockReturnValue(
      makeExtensionMock({ scrapeCourses: mockScrape }),
    );
    mockCompare.mockResolvedValue(mockComparisons);

    render(
      <MoodleSyncDialog
        open={true}
        onOpenChange={vi.fn()}
        moodleConnection={mockConnection}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Intro to CS')).toBeInTheDocument();
    });

    // The preview button should show count of pre-selected courses
    expect(
      screen.getByRole('button', { name: /preview content \(1\)/i }),
    ).toBeInTheDocument();
  });

  it('toggles course selection when checkbox is clicked', async () => {
    const user = userEvent.setup();
    const mockScrape = vi.fn().mockResolvedValue(mockScrapedCourses);
    mockUseMoodleExtension.mockReturnValue(
      makeExtensionMock({ scrapeCourses: mockScrape }),
    );
    mockCompare.mockResolvedValue(mockComparisons);

    render(
      <MoodleSyncDialog
        open={true}
        onOpenChange={vi.fn()}
        moodleConnection={mockConnection}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Intro to CS')).toBeInTheDocument();
    });

    // Click on the Data Structures checkbox to select it
    const dsCheckbox = screen.getByRole('checkbox', {
      name: /select data structures/i,
    });
    await user.click(dsCheckbox);

    // Now 2 courses should be selected
    expect(
      screen.getByRole('button', { name: /preview content \(2\)/i }),
    ).toBeInTheDocument();
  });

  it('calls syncMoodleCourses and shows success when sync clicked', async () => {
    const user = userEvent.setup();
    const mockScrape = vi.fn().mockResolvedValue(mockScrapedCourses);
    const mockScrapeContent = vi.fn().mockResolvedValue({
      sections: [
        {
          moodleSectionId: 'sec-1',
          title: 'Week 1',
          position: 0,
          items: [
            {
              type: 'link' as const,
              name: 'Lecture Notes',
              moodleUrl: 'https://moodle.test.ac.il/link/1',
            },
          ],
        },
      ],
    });
    mockUseMoodleExtension.mockReturnValue(
      makeExtensionMock({
        scrapeCourses: mockScrape,
        scrapeCourseContent: mockScrapeContent,
        downloadAndUpload: vi.fn(),
      }),
    );
    mockCompare.mockResolvedValue(mockComparisons);
    mockSync.mockResolvedValue({
      syncedCount: 1,
      courses: [{ moodleCourseId: 'CS101', sections: [] }],
    });

    render(
      <MoodleSyncDialog
        open={true}
        onOpenChange={vi.fn()}
        moodleConnection={mockConnection}
      />,
    );

    // Wait for course list to appear
    await waitFor(() => {
      expect(screen.getByText('Intro to CS')).toBeInTheDocument();
    });

    // Click Preview Content to go to content selection phase
    const previewButton = screen.getByRole('button', {
      name: /preview content/i,
    });
    await user.click(previewButton);

    // Wait for content selection phase
    await waitFor(() => {
      expect(screen.getByText('Lecture Notes')).toBeInTheDocument();
    });

    // Click Sync Selected
    const syncButton = screen.getByRole('button', { name: /sync selected/i });
    await user.click(syncButton);

    await waitFor(() => {
      expect(
        screen.getByText(/successfully synced 1 course/i),
      ).toBeInTheDocument();
    });

    expect(mockSync).toHaveBeenCalledWith(
      'moodle.test.ac.il',
      expect.arrayContaining([
        expect.objectContaining({
          moodleCourseId: 'CS101',
          name: 'Intro to CS',
        }),
      ]),
    );
  });

  it('shows error and retry button on scrape failure', async () => {
    const mockScrape = vi
      .fn()
      .mockRejectedValue(new Error('Extension crashed'));
    mockUseMoodleExtension.mockReturnValue(
      makeExtensionMock({ scrapeCourses: mockScrape }),
    );

    render(
      <MoodleSyncDialog
        open={true}
        onOpenChange={vi.fn()}
        moodleConnection={mockConnection}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Extension crashed');
    });

    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('shows friendly network message when error matches network patterns', async () => {
    const mockScrape = vi.fn().mockRejectedValue(new Error('fetch failed'));
    mockUseMoodleExtension.mockReturnValue(
      makeExtensionMock({ scrapeCourses: mockScrape }),
    );

    render(
      <MoodleSyncDialog
        open={true}
        onOpenChange={vi.fn()}
        moodleConnection={mockConnection}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        /Couldn't reach moodle\.test\.ac\.il/i,
      );
    });
  });

  it('shows Retry failed button after partial sync and re-runs only failed jobs', async () => {
    const user = userEvent.setup();
    const mockScrape = vi.fn().mockResolvedValue(mockScrapedCourses);
    const mockScrapeContent = vi.fn().mockResolvedValue({
      sections: [
        {
          moodleSectionId: 'sec-1',
          title: 'Week 1',
          position: 0,
          items: [
            {
              type: 'file' as const,
              name: 'good.pdf',
              moodleUrl: 'https://moodle.test.ac.il/file/good',
            },
            {
              type: 'file' as const,
              name: 'bad.pdf',
              moodleUrl: 'https://moodle.test.ac.il/file/bad',
            },
          ],
        },
      ],
    });
    // First call: good succeeds, bad fails. Second call (retry): bad succeeds.
    const mockDownloadAndUpload = vi
      .fn()
      .mockResolvedValueOnce(undefined) // good.pdf
      .mockRejectedValueOnce(new Error('network exploded')) // bad.pdf
      .mockResolvedValueOnce(undefined); // bad.pdf retry
    mockUseMoodleExtension.mockReturnValue(
      makeExtensionMock({
        scrapeCourses: mockScrape,
        scrapeCourseContent: mockScrapeContent,
        downloadAndUpload: mockDownloadAndUpload,
      }),
    );
    mockCompare.mockResolvedValue(mockComparisons);
    mockSync.mockResolvedValue({
      syncedCount: 1,
      courses: [
        {
          moodleCourseId: 'CS101',
          sections: [
            {
              id: 'section-db-1',
              moodleSectionId: 'sec-1',
              items: [
                { moodleUrl: 'https://moodle.test.ac.il/file/good' },
                { moodleUrl: 'https://moodle.test.ac.il/file/bad' },
              ],
            },
          ],
        },
      ],
    });

    render(
      <MoodleSyncDialog
        open={true}
        onOpenChange={vi.fn()}
        moodleConnection={mockConnection}
      />,
    );

    // Wait for course list, then preview content
    await waitFor(() => {
      expect(screen.getByText('Intro to CS')).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: /preview content/i }));

    await waitFor(() => {
      expect(screen.getByText('good.pdf')).toBeInTheDocument();
      expect(screen.getByText('bad.pdf')).toBeInTheDocument();
    });

    // Trigger sync
    await user.click(screen.getByRole('button', { name: /sync selected/i }));

    // Wait for done phase with retry button
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /retry failed \(1\)/i }),
      ).toBeInTheDocument();
    });

    // downloadAndUpload was called twice (one per file)
    expect(mockDownloadAndUpload).toHaveBeenCalledTimes(2);

    // Click retry — should re-run only the failed job (bad.pdf)
    await user.click(screen.getByRole('button', { name: /retry failed/i }));

    await waitFor(() => {
      expect(
        screen.queryByRole('button', { name: /retry failed/i }),
      ).not.toBeInTheDocument();
    });

    // 3rd call should be only for bad.pdf
    expect(mockDownloadAndUpload).toHaveBeenCalledTimes(3);
    const thirdCallArg = mockDownloadAndUpload.mock.calls[2][0];
    expect(thirdCallArg.moodleFileUrl).toBe(
      'https://moodle.test.ac.il/file/bad',
    );

    // Close button should still be present (footer Close, not the dialog X)
    expect(
      screen.getAllByRole('button', { name: /close/i }).length,
    ).toBeGreaterThan(0);
  });

  it('shows awaiting-permission UI when permission needs popup grant', async () => {
    // First call: needs popup. After the polling loop sees the grant, scrape runs.
    const mockCheckPermission = vi
      .fn()
      .mockResolvedValueOnce(false) // initial gate
      .mockResolvedValueOnce(false) // first poll
      .mockResolvedValue(true); // subsequent polls — granted
    const mockRequestPermission = vi.fn().mockResolvedValue({
      granted: false,
      needsPopup: true,
      host: 'moodle.test.ac.il',
    });
    const mockScrape = vi.fn().mockResolvedValue(mockScrapedCourses);
    mockUseMoodleExtension.mockReturnValue(
      makeExtensionMock({
        scrapeCourses: mockScrape,
        checkPermission: mockCheckPermission,
        requestPermission: mockRequestPermission,
      }),
    );
    mockCompare.mockResolvedValue(mockComparisons);

    render(
      <MoodleSyncDialog
        open={true}
        onOpenChange={vi.fn()}
        moodleConnection={mockConnection}
      />,
    );

    // The dialog should land in awaiting-permission with the per-host copy.
    expect(await screen.findByText(/approve access to/i)).toBeInTheDocument();

    // requestPermission was called with the host URL.
    expect(mockRequestPermission).toHaveBeenCalledWith(
      'https://moodle.test.ac.il',
    );

    // After polling sees a grant, the dialog auto-resumes and reaches the
    // course list.
    await waitFor(
      () => {
        expect(screen.getByText('Intro to CS')).toBeInTheDocument();
      },
      { timeout: 5000 },
    );
  });

  it('disables sync button when no courses are selected', async () => {
    userEvent.setup();
    const mockScrape = vi.fn().mockResolvedValue(mockScrapedCourses);
    mockUseMoodleExtension.mockReturnValue(
      makeExtensionMock({ scrapeCourses: mockScrape }),
    );
    // All courses synced_by_user — none pre-selected
    mockCompare.mockResolvedValue([
      {
        moodleCourseId: 'CS101',
        name: 'Intro to CS',
        moodleUrl: 'https://moodle.test.ac.il/course/101',
        status: 'synced_by_user',
        registryId: 'reg-101',
      },
    ]);

    render(
      <MoodleSyncDialog
        open={true}
        onOpenChange={vi.fn()}
        moodleConnection={mockConnection}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Intro to CS')).toBeInTheDocument();
    });

    const previewButton = screen.getByRole('button', {
      name: /preview content \(0\)/i,
    });
    expect(previewButton).toBeDisabled();
  });

  it('cancel during sync stops downloads not yet started and reports partial progress', async () => {
    const user = userEvent.setup();

    // More files than the download concurrency (4), so once we cancel before
    // the pool pulls the rest, only the first `concurrency` ever start.
    const CONCURRENCY = 4;
    const files = Array.from({ length: CONCURRENCY + 4 }, (_, i) => ({
      type: 'file' as const,
      name: `f${i}.pdf`,
      moodleUrl: `https://moodle.test.ac.il/file/${i}`,
    }));

    const mockScrape = vi.fn().mockResolvedValue(mockScrapedCourses);
    const mockScrapeContent = vi.fn().mockResolvedValue({
      sections: [
        {
          moodleSectionId: 'sec-1',
          title: 'Week 1',
          position: 0,
          items: files,
        },
      ],
    });

    // Each download hangs until we release it, so we can click Cancel while the
    // first batch is genuinely in-flight.
    const releases: Array<() => void> = [];
    const mockDownloadAndUpload = vi.fn(
      () => new Promise<void>((resolve) => releases.push(resolve)),
    );

    mockUseMoodleExtension.mockReturnValue(
      makeExtensionMock({
        scrapeCourses: mockScrape,
        scrapeCourseContent: mockScrapeContent,
        downloadAndUpload: mockDownloadAndUpload,
      }),
    );
    mockCompare.mockResolvedValue(mockComparisons);
    mockSync.mockResolvedValue({
      syncedCount: 1,
      courses: [
        {
          moodleCourseId: 'CS101',
          sections: [
            {
              id: 'section-db-1',
              moodleSectionId: 'sec-1',
              items: files.map((f) => ({ moodleUrl: f.moodleUrl })),
            },
          ],
        },
      ],
    });

    render(
      <MoodleSyncDialog
        open={true}
        onOpenChange={vi.fn()}
        moodleConnection={mockConnection}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Intro to CS')).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: /preview content/i }));
    await waitFor(() => {
      expect(screen.getByText('f0.pdf')).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: /sync selected/i }));

    // Pool launches exactly `concurrency` workers and then waits on the
    // hanging downloads.
    await waitFor(() => {
      expect(mockDownloadAndUpload).toHaveBeenCalledTimes(CONCURRENCY);
    });

    // Cancel while that first batch is in-flight.
    await user.click(screen.getByRole('button', { name: /^cancel$/i }));

    // Release the in-flight downloads; the workers should then see the cancel
    // flag and NOT pull the remaining queued jobs.
    releases.forEach((resolve) => resolve());

    await waitFor(() => {
      expect(
        screen.getByText(/downloaded before stopping/i),
      ).toBeInTheDocument();
    });

    // Still `concurrency` — the queued files never started.
    expect(mockDownloadAndUpload).toHaveBeenCalledTimes(CONCURRENCY);
  });
});
