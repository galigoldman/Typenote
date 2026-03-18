import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QuestionBrowserPanel } from './question-browser-panel';

// Fixed description HTML used across tests — 60 chars so slice boundaries work
const DESCRIPTION_HTML = 'Question one text here        Question two text here  ';

const defaultSplits = [
  {
    id: 'split-1',
    creator_type: 'ai',
    is_personal: false,
    content_version: 1,
    created_at: '2026-03-18T00:00:00Z',
    split_questions: [
      {
        id: 'q1',
        label: '1',
        position: 0,
        boundary_start: 0,
        boundary_end: 30,
        low_confidence: false,
      },
      {
        id: 'q2',
        label: '2',
        position: 1,
        boundary_start: 30,
        boundary_end: 60,
        low_confidence: false,
      },
    ],
  },
];

function makeFetchMock(splits = defaultSplits) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ splits }),
  });
}

const defaultProps = {
  assignmentId: 'assignment-1',
  descriptionHtml: DESCRIPTION_HTML,
  isOpen: true,
  onClose: vi.fn(),
  onCopyQuestion: vi.fn(),
};

describe('QuestionBrowserPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // 1. Renders question list from selected split
  // -------------------------------------------------------------------------
  it('renders question list from selected split', async () => {
    global.fetch = makeFetchMock();

    render(<QuestionBrowserPanel {...defaultProps} />);

    // Header should always be present
    expect(screen.getByText('Questions')).toBeInTheDocument();

    // Wait for the questions to load
    await waitFor(() => {
      expect(screen.getByText('Question 1')).toBeInTheDocument();
    });

    expect(screen.getByText('Question 2')).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // 2. Calls onCopyQuestion when the copy button is clicked
  // -------------------------------------------------------------------------
  it('calls onCopyQuestion with createNewDoc: false when Copy to document is clicked', async () => {
    global.fetch = makeFetchMock();
    const onCopyQuestion = vi.fn();
    const user = userEvent.setup();

    render(
      <QuestionBrowserPanel {...defaultProps} onCopyQuestion={onCopyQuestion} />,
    );

    await waitFor(() => {
      expect(screen.getByText('Question 1')).toBeInTheDocument();
    });

    // Click the first "Copy to document" button
    const copyButtons = screen.getAllByRole('button', {
      name: /copy to document/i,
    });
    await user.click(copyButtons[0]);

    expect(onCopyQuestion).toHaveBeenCalledOnce();
    expect(onCopyQuestion).toHaveBeenCalledWith(
      expect.objectContaining({
        label: '1',
        assignmentId: 'assignment-1',
        splitId: 'split-1',
        createNewDoc: false,
        html: DESCRIPTION_HTML.slice(0, 30),
        preambleHtml: null,
      }),
    );
  });

  // -------------------------------------------------------------------------
  // 3. Shows "New document" option and calls onCopyQuestion with createNewDoc: true
  // -------------------------------------------------------------------------
  it('shows the New document button and calls onCopyQuestion with createNewDoc: true', async () => {
    global.fetch = makeFetchMock();
    const onCopyQuestion = vi.fn();
    const user = userEvent.setup();

    render(
      <QuestionBrowserPanel {...defaultProps} onCopyQuestion={onCopyQuestion} />,
    );

    await waitFor(() => {
      expect(screen.getByText('Question 1')).toBeInTheDocument();
    });

    const newDocButtons = screen.getAllByRole('button', {
      name: /new document/i,
    });
    expect(newDocButtons.length).toBeGreaterThan(0);

    await user.click(newDocButtons[0]);

    expect(onCopyQuestion).toHaveBeenCalledOnce();
    expect(onCopyQuestion).toHaveBeenCalledWith(
      expect.objectContaining({
        label: '1',
        assignmentId: 'assignment-1',
        splitId: 'split-1',
        createNewDoc: true,
      }),
    );
  });

  // -------------------------------------------------------------------------
  // 4. Does not render when closed
  // -------------------------------------------------------------------------
  it('does not render when isOpen is false', () => {
    global.fetch = makeFetchMock();

    const { container } = render(
      <QuestionBrowserPanel {...defaultProps} isOpen={false} />,
    );

    expect(container.innerHTML).toBe('');
  });

  // -------------------------------------------------------------------------
  // 5. Shows loading state while fetching
  // -------------------------------------------------------------------------
  it('shows a loading indicator while fetching splits', async () => {
    // Fetch that never resolves so we stay in loading state
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {}));

    render(<QuestionBrowserPanel {...defaultProps} />);

    expect(screen.getByText('Loading questions...')).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // 6. Shows empty state when no splits are returned
  // -------------------------------------------------------------------------
  it('shows an empty state when no splits are available', async () => {
    global.fetch = makeFetchMock([]);

    render(<QuestionBrowserPanel {...defaultProps} />);

    await waitFor(() => {
      expect(
        screen.getByText('No question splits available yet.'),
      ).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // 7. Shows "Low confidence" badge on flagged questions
  // -------------------------------------------------------------------------
  it('shows a Low confidence badge on flagged questions', async () => {
    const splitsWithLowConf = [
      {
        ...defaultSplits[0],
        split_questions: [
          {
            id: 'q1',
            label: '1',
            position: 0,
            boundary_start: 0,
            boundary_end: 30,
            low_confidence: true,
          },
        ],
      },
    ];
    global.fetch = makeFetchMock(splitsWithLowConf);

    render(<QuestionBrowserPanel {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Low confidence')).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // 8. Shows stale indicator when split content_version is lower than latest
  // -------------------------------------------------------------------------
  it('shows a stale indicator when a split has a lower content_version', async () => {
    const splitsWithVersions = [
      {
        id: 'split-old',
        creator_type: 'ai' as const,
        is_personal: false,
        content_version: 1,
        created_at: '2026-03-10T00:00:00Z',
        split_questions: defaultSplits[0].split_questions,
      },
      {
        id: 'split-new',
        creator_type: 'student' as const,
        is_personal: false,
        content_version: 2,
        created_at: '2026-03-18T00:00:00Z',
        split_questions: [],
      },
    ];
    global.fetch = makeFetchMock(splitsWithVersions);

    render(<QuestionBrowserPanel {...defaultProps} />);

    await waitFor(() => {
      // The select option shows "(older version)" and the stale warning paragraph also appears
      const matches = screen.getAllByText(/older version/i);
      expect(matches.length).toBeGreaterThan(0);
    });
  });
});
