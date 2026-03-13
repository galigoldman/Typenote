import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MoodleFilePicker } from './moodle-file-picker';

// Mock the extension hook
vi.mock('@/hooks/use-moodle-extension', () => ({
  useMoodleExtension: vi.fn(),
}));

// Mock server actions
vi.mock('@/lib/actions/moodle-sync', () => ({
  recordFileImports: vi.fn(),
}));

import { useMoodleExtension } from '@/hooks/use-moodle-extension';
import { recordFileImports } from '@/lib/actions/moodle-sync';

const mockUseMoodleExtension = useMoodleExtension as ReturnType<typeof vi.fn>;
const mockRecordFileImports = recordFileImports as ReturnType<typeof vi.fn>;

const defaultProps = {
  moodleCourseId: 'course-uuid-1',
  moodleCourseMoodleId: 'CS101',
  courseUrl: 'https://moodle.test.ac.il/course/view.php?id=101',
  instanceDomain: 'moodle.test.ac.il',
  onImportComplete: vi.fn(),
};

const mockScrapedContent = {
  sections: [
    {
      moodleSectionId: 'sec-1',
      title: 'Week 1: Introduction',
      position: 0,
      items: [
        {
          type: 'file' as const,
          name: 'lecture-1.pdf',
          moodleUrl: 'https://moodle.test.ac.il/mod/resource/view.php?id=1',
          fileSize: 1048576, // 1 MB
          mimeType: 'application/pdf',
        },
        {
          type: 'link' as const,
          name: 'Course Website',
          moodleUrl: 'https://moodle.test.ac.il/mod/url/view.php?id=2',
          externalUrl: 'https://example.com',
        },
      ],
    },
    {
      moodleSectionId: 'sec-2',
      title: 'Week 2: Data Types',
      position: 1,
      items: [
        {
          type: 'file' as const,
          name: 'homework-1.pdf',
          moodleUrl: 'https://moodle.test.ac.il/mod/resource/view.php?id=3',
          fileSize: 524288, // 512 KB
          mimeType: 'application/pdf',
        },
      ],
    },
  ],
};

const mockStatusResponse = {
  lastSyncedAt: null,
  importedFileIds: [],
  removedFileIds: [],
  modifiedFileIds: [],
};

describe('MoodleFilePicker', () => {
  beforeEach(() => {
    vi.resetAllMocks();

    // Default: mock fetch for status API
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockStatusResponse),
    });
  });

  it('shows loading state while scraping course content', () => {
    const mockScrape = vi.fn().mockReturnValue(new Promise(() => {})); // never resolves
    mockUseMoodleExtension.mockReturnValue({
      scrapeCourseContent: mockScrape,
      downloadAndUpload: vi.fn(),
    });

    render(<MoodleFilePicker {...defaultProps} />);

    expect(screen.getByText(/scanning course content/i)).toBeInTheDocument();
  });

  it('renders sections and files from scraped content', async () => {
    const mockScrape = vi.fn().mockResolvedValue(mockScrapedContent);
    mockUseMoodleExtension.mockReturnValue({
      scrapeCourseContent: mockScrape,
      downloadAndUpload: vi.fn(),
    });

    render(<MoodleFilePicker {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Week 1: Introduction')).toBeInTheDocument();
    });

    expect(screen.getByText('Week 2: Data Types')).toBeInTheDocument();
    expect(screen.getByText('lecture-1.pdf')).toBeInTheDocument();
    expect(screen.getByText('Course Website')).toBeInTheDocument();
    expect(screen.getByText('homework-1.pdf')).toBeInTheDocument();
  });

  it('shows file size when available', async () => {
    const mockScrape = vi.fn().mockResolvedValue(mockScrapedContent);
    mockUseMoodleExtension.mockReturnValue({
      scrapeCourseContent: mockScrape,
      downloadAndUpload: vi.fn(),
    });

    render(<MoodleFilePicker {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('lecture-1.pdf')).toBeInTheDocument();
    });

    // 1048576 bytes = 1.0 MB
    expect(screen.getByText('1.0 MB')).toBeInTheDocument();
    // 524288 bytes = 512.0 KB
    expect(screen.getByText('512.0 KB')).toBeInTheDocument();
  });

  it('shows "Already imported" badge for imported files', async () => {
    const mockScrape = vi.fn().mockResolvedValue(mockScrapedContent);
    mockUseMoodleExtension.mockReturnValue({
      scrapeCourseContent: mockScrape,
      downloadAndUpload: vi.fn(),
    });

    // The status API returns file IDs that match our itemKey format
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          lastSyncedAt: '2026-03-10T12:00:00Z',
          importedFileIds: [
            'sec-1::https://moodle.test.ac.il/mod/resource/view.php?id=1',
          ],
          removedFileIds: [],
          modifiedFileIds: [],
        }),
    });

    render(<MoodleFilePicker {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('lecture-1.pdf')).toBeInTheDocument();
    });

    expect(screen.getByText('Already imported')).toBeInTheDocument();
  });

  it('renders empty state when no sections found', async () => {
    const mockScrape = vi.fn().mockResolvedValue({ sections: [] });
    mockUseMoodleExtension.mockReturnValue({
      scrapeCourseContent: mockScrape,
      downloadAndUpload: vi.fn(),
    });

    render(<MoodleFilePicker {...defaultProps} />);

    await waitFor(() => {
      expect(
        screen.getByText(/no files found in this course/i),
      ).toBeInTheDocument();
    });
  });

  it('renders empty state when scraper returns null', async () => {
    const mockScrape = vi.fn().mockResolvedValue(null);
    mockUseMoodleExtension.mockReturnValue({
      scrapeCourseContent: mockScrape,
      downloadAndUpload: vi.fn(),
    });

    render(<MoodleFilePicker {...defaultProps} />);

    await waitFor(() => {
      expect(
        screen.getByText(/no files found in this course/i),
      ).toBeInTheDocument();
    });
  });

  it('pre-selects all items and shows Import Selected button', async () => {
    const mockScrape = vi.fn().mockResolvedValue(mockScrapedContent);
    mockUseMoodleExtension.mockReturnValue({
      scrapeCourseContent: mockScrape,
      downloadAndUpload: vi.fn(),
    });

    render(<MoodleFilePicker {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('lecture-1.pdf')).toBeInTheDocument();
    });

    // 3 items total, all pre-selected
    expect(
      screen.getByRole('button', { name: /import selected \(3\)/i }),
    ).toBeInTheDocument();
  });

  it('toggles item selection when checkbox is clicked', async () => {
    const user = userEvent.setup();
    const mockScrape = vi.fn().mockResolvedValue(mockScrapedContent);
    mockUseMoodleExtension.mockReturnValue({
      scrapeCourseContent: mockScrape,
      downloadAndUpload: vi.fn(),
    });

    render(<MoodleFilePicker {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('lecture-1.pdf')).toBeInTheDocument();
    });

    // Deselect one item
    const checkbox = screen.getByRole('checkbox', {
      name: /select lecture-1\.pdf/i,
    });
    await user.click(checkbox);

    // Now 2 selected
    expect(
      screen.getByRole('button', { name: /import selected \(2\)/i }),
    ).toBeInTheDocument();
  });

  it('collapses and expands sections when header is clicked', async () => {
    const user = userEvent.setup();
    const mockScrape = vi.fn().mockResolvedValue(mockScrapedContent);
    mockUseMoodleExtension.mockReturnValue({
      scrapeCourseContent: mockScrape,
      downloadAndUpload: vi.fn(),
    });

    render(<MoodleFilePicker {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('lecture-1.pdf')).toBeInTheDocument();
    });

    // Collapse Week 1
    const sectionButton = screen.getByRole('button', {
      name: /collapse week 1: introduction/i,
    });
    await user.click(sectionButton);

    // Items inside Week 1 should be hidden
    expect(screen.queryByText('lecture-1.pdf')).not.toBeInTheDocument();

    // Expand again
    const expandButton = screen.getByRole('button', {
      name: /expand week 1: introduction/i,
    });
    await user.click(expandButton);

    expect(screen.getByText('lecture-1.pdf')).toBeInTheDocument();
  });

  it('calls downloadAndUpload and recordFileImports when Import Selected is clicked', async () => {
    const user = userEvent.setup();
    const mockScrape = vi.fn().mockResolvedValue(mockScrapedContent);
    const mockDownload = vi.fn().mockResolvedValue(null); // stub returns null
    mockUseMoodleExtension.mockReturnValue({
      scrapeCourseContent: mockScrape,
      downloadAndUpload: mockDownload,
    });
    mockRecordFileImports.mockResolvedValue({
      syncId: 'sync-1',
      importedCount: 0,
    });

    render(<MoodleFilePicker {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('lecture-1.pdf')).toBeInTheDocument();
    });

    const importButton = screen.getByRole('button', {
      name: /import selected \(3\)/i,
    });
    await user.click(importButton);

    await waitFor(() => {
      expect(screen.getByText(/import complete/i)).toBeInTheDocument();
    });

    // downloadAndUpload called for each selected item
    expect(mockDownload).toHaveBeenCalledTimes(3);
    // recordFileImports called once with all file IDs
    expect(mockRecordFileImports).toHaveBeenCalledWith(
      'course-uuid-1',
      [], // empty because stub returns null
    );
    expect(defaultProps.onImportComplete).toHaveBeenCalled();
  });

  it('disables Import Selected button when nothing is selected', async () => {
    const user = userEvent.setup();
    const mockScrape = vi.fn().mockResolvedValue({
      sections: [
        {
          moodleSectionId: 'sec-1',
          title: 'Week 1',
          position: 0,
          items: [
            {
              type: 'file' as const,
              name: 'only-file.pdf',
              moodleUrl:
                'https://moodle.test.ac.il/mod/resource/view.php?id=99',
            },
          ],
        },
      ],
    });
    mockUseMoodleExtension.mockReturnValue({
      scrapeCourseContent: mockScrape,
      downloadAndUpload: vi.fn(),
    });

    render(<MoodleFilePicker {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('only-file.pdf')).toBeInTheDocument();
    });

    // Deselect the only item
    const checkbox = screen.getByRole('checkbox', {
      name: /select only-file\.pdf/i,
    });
    await user.click(checkbox);

    const importButton = screen.getByRole('button', {
      name: /import selected \(0\)/i,
    });
    expect(importButton).toBeDisabled();
  });

  it('shows error state and retry button on scrape failure', async () => {
    const mockScrape = vi
      .fn()
      .mockRejectedValue(new Error('Extension not responding'));
    mockUseMoodleExtension.mockReturnValue({
      scrapeCourseContent: mockScrape,
      downloadAndUpload: vi.fn(),
    });

    render(<MoodleFilePicker {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Extension not responding',
      );
    });

    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('shows progress messages during import', async () => {
    const user = userEvent.setup();

    // Use a deferred promise so we can control timing
    let resolveDownload!: (value: null) => void;
    const downloadPromise = new Promise<null>((resolve) => {
      resolveDownload = resolve;
    });

    const mockScrape = vi.fn().mockResolvedValue({
      sections: [
        {
          moodleSectionId: 'sec-1',
          title: 'Week 1',
          position: 0,
          items: [
            {
              type: 'file' as const,
              name: 'test-file.pdf',
              moodleUrl: 'https://moodle.test.ac.il/mod/resource/view.php?id=1',
            },
          ],
        },
      ],
    });
    const mockDownload = vi.fn().mockReturnValue(downloadPromise);
    mockUseMoodleExtension.mockReturnValue({
      scrapeCourseContent: mockScrape,
      downloadAndUpload: mockDownload,
    });
    mockRecordFileImports.mockResolvedValue({
      syncId: 'sync-1',
      importedCount: 0,
    });

    render(<MoodleFilePicker {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('test-file.pdf')).toBeInTheDocument();
    });

    const importButton = screen.getByRole('button', {
      name: /import selected \(1\)/i,
    });
    await user.click(importButton);

    // Should show progress
    await waitFor(() => {
      expect(
        screen.getByText(/downloading file 1\/1: test-file\.pdf/i),
      ).toBeInTheDocument();
    });

    // Resolve the download
    resolveDownload(null);

    // Should complete
    await waitFor(() => {
      expect(screen.getByText(/import complete/i)).toBeInTheDocument();
    });
  });

  it('shows file type indicators for files and links', async () => {
    const mockScrape = vi.fn().mockResolvedValue(mockScrapedContent);
    mockUseMoodleExtension.mockReturnValue({
      scrapeCourseContent: mockScrape,
      downloadAndUpload: vi.fn(),
    });

    render(<MoodleFilePicker {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('lecture-1.pdf')).toBeInTheDocument();
    });

    // Check for file and link type indicators via aria-label
    const fileIcons = screen.getAllByRole('img', { name: 'File' });
    const linkIcons = screen.getAllByRole('img', { name: 'Link' });

    expect(fileIcons.length).toBe(2); // lecture-1.pdf and homework-1.pdf
    expect(linkIcons.length).toBe(1); // Course Website
  });

  it('calls scrapeCourseContent with the correct URL', async () => {
    const mockScrape = vi.fn().mockResolvedValue({ sections: [] });
    mockUseMoodleExtension.mockReturnValue({
      scrapeCourseContent: mockScrape,
      downloadAndUpload: vi.fn(),
    });

    render(<MoodleFilePicker {...defaultProps} />);

    await waitFor(() => {
      expect(mockScrape).toHaveBeenCalledWith(
        'https://moodle.test.ac.il/course/view.php?id=101',
      );
    });
  });

  it('fetches status from the correct API endpoint', async () => {
    const mockScrape = vi.fn().mockResolvedValue({ sections: [] });
    mockUseMoodleExtension.mockReturnValue({
      scrapeCourseContent: mockScrape,
      downloadAndUpload: vi.fn(),
    });

    render(<MoodleFilePicker {...defaultProps} />);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/moodle/status?moodleCourseId=course-uuid-1',
      );
    });
  });

  it('shows "Removed from Moodle" indicator for removed files', async () => {
    const mockScrape = vi.fn().mockResolvedValue(mockScrapedContent);
    mockUseMoodleExtension.mockReturnValue({
      scrapeCourseContent: mockScrape,
      downloadAndUpload: vi.fn(),
    });

    // Status API returns one file as removed (using itemKey format)
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          lastSyncedAt: '2026-03-10T12:00:00Z',
          importedFileIds: [],
          removedFileIds: [
            'sec-1::https://moodle.test.ac.il/mod/resource/view.php?id=1',
          ],
          modifiedFileIds: [],
        }),
    });

    render(<MoodleFilePicker {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('lecture-1.pdf')).toBeInTheDocument();
    });

    expect(screen.getByText('Removed from Moodle')).toBeInTheDocument();
  });

  it('disables checkbox for removed files', async () => {
    const mockScrape = vi.fn().mockResolvedValue(mockScrapedContent);
    mockUseMoodleExtension.mockReturnValue({
      scrapeCourseContent: mockScrape,
      downloadAndUpload: vi.fn(),
    });

    // Status API returns one file as removed
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          lastSyncedAt: '2026-03-10T12:00:00Z',
          importedFileIds: [],
          removedFileIds: [
            'sec-1::https://moodle.test.ac.il/mod/resource/view.php?id=1',
          ],
          modifiedFileIds: [],
        }),
    });

    render(<MoodleFilePicker {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('lecture-1.pdf')).toBeInTheDocument();
    });

    // The checkbox for the removed file should be disabled
    const removedCheckbox = screen.getByRole('checkbox', {
      name: /select lecture-1\.pdf/i,
    });
    expect(removedCheckbox).toBeDisabled();

    // Other checkboxes should NOT be disabled
    const otherCheckbox = screen.getByRole('checkbox', {
      name: /select course website/i,
    });
    expect(otherCheckbox).not.toBeDisabled();
  });

  it('shows "Modified" badge for modified files', async () => {
    const mockScrape = vi.fn().mockResolvedValue(mockScrapedContent);
    mockUseMoodleExtension.mockReturnValue({
      scrapeCourseContent: mockScrape,
      downloadAndUpload: vi.fn(),
    });

    // Status API returns one file as modified
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          lastSyncedAt: '2026-03-10T12:00:00Z',
          importedFileIds: [],
          removedFileIds: [],
          modifiedFileIds: [
            'sec-2::https://moodle.test.ac.il/mod/resource/view.php?id=3',
          ],
        }),
    });

    render(<MoodleFilePicker {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('homework-1.pdf')).toBeInTheDocument();
    });

    expect(screen.getByText('Modified')).toBeInTheDocument();
  });

  it('filters out non-actionable items when "Show only actionable" is toggled', async () => {
    const user = userEvent.setup();
    const mockScrape = vi.fn().mockResolvedValue(mockScrapedContent);
    mockUseMoodleExtension.mockReturnValue({
      scrapeCourseContent: mockScrape,
      downloadAndUpload: vi.fn(),
    });

    // One file imported, one removed — only one should remain actionable
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          lastSyncedAt: '2026-03-10T12:00:00Z',
          importedFileIds: [
            'sec-1::https://moodle.test.ac.il/mod/resource/view.php?id=1',
          ],
          removedFileIds: [
            'sec-1::https://moodle.test.ac.il/mod/url/view.php?id=2',
          ],
          modifiedFileIds: [],
        }),
    });

    render(<MoodleFilePicker {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('lecture-1.pdf')).toBeInTheDocument();
    });

    // All items visible initially
    expect(screen.getByText('lecture-1.pdf')).toBeInTheDocument();
    expect(screen.getByText('Course Website')).toBeInTheDocument();
    expect(screen.getByText('homework-1.pdf')).toBeInTheDocument();

    // Toggle the filter
    const filterCheckbox = screen.getByRole('checkbox', {
      name: /show only actionable items/i,
    });
    await user.click(filterCheckbox);

    // Imported and removed files should be hidden
    expect(screen.queryByText('lecture-1.pdf')).not.toBeInTheDocument();
    expect(screen.queryByText('Course Website')).not.toBeInTheDocument();
    // homework-1.pdf is neither imported nor removed — should still show
    expect(screen.getByText('homework-1.pdf')).toBeInTheDocument();
  });

  it('shows "Too large" badge and disables checkbox for files over 50MB', async () => {
    const oversizedContent = {
      sections: [
        {
          moodleSectionId: 'sec-1',
          title: 'Week 1',
          position: 0,
          items: [
            {
              type: 'file' as const,
              name: 'huge-video.mp4',
              moodleUrl:
                'https://moodle.test.ac.il/mod/resource/view.php?id=10',
              fileSize: 60 * 1024 * 1024, // 60 MB — exceeds 50 MB limit
              mimeType: 'video/mp4',
            },
            {
              type: 'file' as const,
              name: 'small-file.pdf',
              moodleUrl:
                'https://moodle.test.ac.il/mod/resource/view.php?id=11',
              fileSize: 1024 * 1024, // 1 MB
              mimeType: 'application/pdf',
            },
          ],
        },
      ],
    };

    const mockScrape = vi.fn().mockResolvedValue(oversizedContent);
    mockUseMoodleExtension.mockReturnValue({
      scrapeCourseContent: mockScrape,
      downloadAndUpload: vi.fn(),
    });

    render(<MoodleFilePicker {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('huge-video.mp4')).toBeInTheDocument();
    });

    // Should show "Too large" badge
    expect(screen.getByText('Too large')).toBeInTheDocument();

    // Checkbox for oversized file should be disabled
    const oversizedCheckbox = screen.getByRole('checkbox', {
      name: /select huge-video\.mp4/i,
    });
    expect(oversizedCheckbox).toBeDisabled();

    // Normal file should not be disabled
    const normalCheckbox = screen.getByRole('checkbox', {
      name: /select small-file\.pdf/i,
    });
    expect(normalCheckbox).not.toBeDisabled();

    // Only 1 item should be pre-selected (the small file)
    expect(
      screen.getByRole('button', { name: /import selected \(1\)/i }),
    ).toBeInTheDocument();
  });

  it('shows failed items list and retry button after import with failures', async () => {
    const user = userEvent.setup();

    const mockScrape = vi.fn().mockResolvedValue({
      sections: [
        {
          moodleSectionId: 'sec-1',
          title: 'Week 1',
          position: 0,
          items: [
            {
              type: 'file' as const,
              name: 'good-file.pdf',
              moodleUrl:
                'https://moodle.test.ac.il/mod/resource/view.php?id=20',
            },
            {
              type: 'file' as const,
              name: 'bad-file.pdf',
              moodleUrl:
                'https://moodle.test.ac.il/mod/resource/view.php?id=21',
            },
          ],
        },
      ],
    });

    // First call succeeds (returns data), second returns null (failure)
    const mockDownload = vi
      .fn()
      .mockResolvedValueOnce({
        contentHash: 'abc',
        fileSize: 100,
        mimeType: 'application/pdf',
        deduplicated: false,
      })
      .mockResolvedValueOnce(null);

    mockUseMoodleExtension.mockReturnValue({
      scrapeCourseContent: mockScrape,
      downloadAndUpload: mockDownload,
    });
    mockRecordFileImports.mockResolvedValue({
      syncId: 'sync-1',
      importedCount: 1,
    });

    render(<MoodleFilePicker {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('good-file.pdf')).toBeInTheDocument();
    });

    const importButton = screen.getByRole('button', {
      name: /import selected \(2\)/i,
    });
    await user.click(importButton);

    await waitFor(() => {
      expect(screen.getByText(/import complete/i)).toBeInTheDocument();
    });

    // Should show the failed item
    expect(screen.getByText('1 file failed to download:')).toBeInTheDocument();
    expect(screen.getByTestId('failed-items-list')).toBeInTheDocument();
    expect(screen.getByText('bad-file.pdf')).toBeInTheDocument();

    // Should show retry button
    expect(screen.getByTestId('retry-failed-button')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /retry failed \(1\)/i }),
    ).toBeInTheDocument();
  });

  it('shows auth error hint when download fails with 403', async () => {
    const user = userEvent.setup();

    const mockScrape = vi.fn().mockResolvedValue({
      sections: [
        {
          moodleSectionId: 'sec-1',
          title: 'Week 1',
          position: 0,
          items: [
            {
              type: 'file' as const,
              name: 'protected-file.pdf',
              moodleUrl:
                'https://moodle.test.ac.il/mod/resource/view.php?id=30',
            },
          ],
        },
      ],
    });

    const mockDownload = vi.fn().mockRejectedValue(new Error('403 Forbidden'));

    mockUseMoodleExtension.mockReturnValue({
      scrapeCourseContent: mockScrape,
      downloadAndUpload: mockDownload,
    });
    mockRecordFileImports.mockResolvedValue({
      syncId: 'sync-1',
      importedCount: 0,
    });

    render(<MoodleFilePicker {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('protected-file.pdf')).toBeInTheDocument();
    });

    const importButton = screen.getByRole('button', {
      name: /import selected \(1\)/i,
    });
    await user.click(importButton);

    await waitFor(() => {
      expect(screen.getByText(/import complete/i)).toBeInTheDocument();
    });

    // Should show auth error hint with Moodle login link
    expect(screen.getByText(/expired moodle session/i)).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /re-log into moodle/i }),
    ).toHaveAttribute('href', 'https://moodle.test.ac.il/login');
  });

  it('shows course linking note in done phase', async () => {
    const user = userEvent.setup();

    const mockScrape = vi.fn().mockResolvedValue({
      sections: [
        {
          moodleSectionId: 'sec-1',
          title: 'Week 1',
          position: 0,
          items: [
            {
              type: 'file' as const,
              name: 'file.pdf',
              moodleUrl:
                'https://moodle.test.ac.il/mod/resource/view.php?id=40',
            },
          ],
        },
      ],
    });

    const mockDownload = vi.fn().mockResolvedValue(null);
    mockUseMoodleExtension.mockReturnValue({
      scrapeCourseContent: mockScrape,
      downloadAndUpload: mockDownload,
    });
    mockRecordFileImports.mockResolvedValue({
      syncId: 'sync-1',
      importedCount: 0,
    });

    render(<MoodleFilePicker {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('file.pdf')).toBeInTheDocument();
    });

    const importButton = screen.getByRole('button', {
      name: /import selected \(1\)/i,
    });
    await user.click(importButton);

    await waitFor(() => {
      expect(screen.getByText(/import complete/i)).toBeInTheDocument();
    });

    expect(
      screen.getByText(/link this moodle course to a typenote course/i),
    ).toBeInTheDocument();
  });
});
