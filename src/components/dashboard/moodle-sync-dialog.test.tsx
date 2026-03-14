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
    mockUseMoodleExtension.mockReturnValue({
      scrapeCourses: mockScrape,
    });

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
    mockUseMoodleExtension.mockReturnValue({
      scrapeCourses: mockScrape,
    });
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
    mockUseMoodleExtension.mockReturnValue({
      scrapeCourses: mockScrape,
    });

    render(
      <MoodleSyncDialog
        open={true}
        onOpenChange={vi.fn()}
        moodleConnection={mockConnection}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/no courses found/i)).toBeInTheDocument();
    });
  });

  it('pre-selects new_to_system courses and shows sync button', async () => {
    const mockScrape = vi.fn().mockResolvedValue(mockScrapedCourses);
    mockUseMoodleExtension.mockReturnValue({
      scrapeCourses: mockScrape,
    });
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
    mockUseMoodleExtension.mockReturnValue({
      scrapeCourses: mockScrape,
    });
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
    mockUseMoodleExtension.mockReturnValue({
      scrapeCourses: mockScrape,
      scrapeCourseContent: mockScrapeContent,
      downloadAndUpload: vi.fn(),
    });
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
      .mockRejectedValue(new Error('Extension timeout'));
    mockUseMoodleExtension.mockReturnValue({
      scrapeCourses: mockScrape,
    });

    render(
      <MoodleSyncDialog
        open={true}
        onOpenChange={vi.fn()}
        moodleConnection={mockConnection}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Extension timeout');
    });

    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('disables sync button when no courses are selected', async () => {
    userEvent.setup();
    const mockScrape = vi.fn().mockResolvedValue(mockScrapedCourses);
    mockUseMoodleExtension.mockReturnValue({
      scrapeCourses: mockScrape,
    });
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
});
