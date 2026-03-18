import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MoveDocumentDialog } from './move-document-dialog';
import type { Document } from '@/types/database';

// Mock the Supabase client
const mockFrom = vi.fn();
const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockOrder = vi.fn();

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: mockFrom,
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }),
    },
  }),
}));

// Mock server actions
vi.mock('@/lib/actions/documents', () => ({
  moveDocument: vi.fn().mockResolvedValue({}),
}));

vi.mock('@/lib/actions/folders', () => ({
  createFolder: vi.fn().mockResolvedValue({}),
}));

const mockDocument: Document = {
  id: 'doc-1',
  user_id: 'user-1',
  folder_id: 'folder-1',
  course_id: null,
  week_id: null,
  material_id: null,
  purpose: null,
  title: 'Test Doc',
  content: {},
  pages: null,
  subject: 'other',
  subject_custom: null,
  canvas_type: 'blank',
  position: 0,
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
};

const mockCourses = [
  {
    id: 'course-1',
    user_id: 'user-1',
    folder_id: null,
    name: 'Calculus II',
    color: '#EF4444',
    position: 0,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
  },
];

const mockWeeks = [
  {
    id: 'week-1',
    course_id: 'course-1',
    user_id: 'user-1',
    week_number: 1,
    topic: 'Integrals',
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
  },
];

const mockFolders = [
  {
    id: 'folder-1',
    user_id: 'user-1',
    parent_id: null,
    name: 'My Notes',
    color: '#3B82F6',
    position: 0,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
  },
  {
    id: 'folder-2',
    user_id: 'user-1',
    parent_id: null,
    name: 'Archive',
    color: '#8B5CF6',
    position: 1,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
  },
];

/**
 * Sets up the mockFrom chain so that calls to
 * supabase.from(table).select('*').eq(...).order(...)
 * and
 * supabase.from(table).select('*').eq(...).is(...).order(...)
 * resolve with the right data depending on the table name.
 */
function setupSupabaseMock({
  courses = mockCourses,
  weeks = mockWeeks,
  folders = mockFolders,
}: {
  courses?: typeof mockCourses;
  weeks?: typeof mockWeeks;
  folders?: typeof mockFolders;
} = {}) {
  mockFrom.mockImplementation((table: string) => {
    if (table === 'courses') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: courses, error: null }),
          }),
        }),
      };
    }
    if (table === 'course_weeks') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: weeks, error: null }),
          }),
        }),
      };
    }
    if (table === 'folders') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            is: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: folders, error: null }),
            }),
          }),
        }),
      };
    }
    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
    };
  });
}

describe('MoveDocumentDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupSupabaseMock();
  });

  it('renders dialog when open', async () => {
    render(
      <MoveDocumentDialog
        document={mockDocument}
        open
        onOpenChange={vi.fn()}
      />,
    );

    expect(
      screen.getByRole('heading', { name: /move document/i }),
    ).toBeInTheDocument();
  });

  it('shows loading state before data loads', () => {
    // Make the Supabase calls hang so loading state persists
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue(new Promise(() => {})),
          is: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue(new Promise(() => {})),
          }),
        }),
      }),
    }));

    render(
      <MoveDocumentDialog
        document={mockDocument}
        open
        onOpenChange={vi.fn()}
      />,
    );

    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders tree with courses and folders', async () => {
    render(
      <MoveDocumentDialog
        document={mockDocument}
        open
        onOpenChange={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Calculus II')).toBeInTheDocument();
    });

    expect(screen.getByText('My Notes')).toBeInTheDocument();
    expect(screen.getByText('Archive')).toBeInTheDocument();
  });

  it('highlights current location', async () => {
    render(
      <MoveDocumentDialog
        document={mockDocument}
        open
        onOpenChange={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('My Notes')).toBeInTheDocument();
    });

    // The document has folder_id: 'folder-1' which is "My Notes"
    // so "current" label should appear next to it
    expect(screen.getByText('current')).toBeInTheDocument();
  });

  it('selects destination on click', async () => {
    render(
      <MoveDocumentDialog
        document={mockDocument}
        open
        onOpenChange={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Calculus II')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Calculus II'));

    // After clicking a course, the "Move Here" button should become enabled.
    // We verify the course is highlighted by checking the button is no longer disabled.
    const moveButton = screen.getByRole('button', { name: /move here/i });
    expect(moveButton).not.toBeDisabled();
  });

  it('cancel closes dialog', async () => {
    const onOpenChange = vi.fn();

    render(
      <MoveDocumentDialog
        document={mockDocument}
        open
        onOpenChange={onOpenChange}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('My Notes')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('confirm calls moveDocument with correct destination', async () => {
    const { moveDocument } = await import('@/lib/actions/documents');
    const onOpenChange = vi.fn();

    render(
      <MoveDocumentDialog
        document={mockDocument}
        open
        onOpenChange={onOpenChange}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Calculus II')).toBeInTheDocument();
    });

    // Select a course as the destination
    fireEvent.click(screen.getByText('Calculus II'));

    // Click "Move Here"
    fireEvent.click(screen.getByRole('button', { name: /move here/i }));

    await waitFor(() => {
      expect(moveDocument).toHaveBeenCalledWith('doc-1', {
        type: 'course',
        courseId: 'course-1',
      });
    });
  });

  it('new folder creation calls createFolder', async () => {
    const { createFolder } = await import('@/lib/actions/folders');

    render(
      <MoveDocumentDialog
        document={mockDocument}
        open
        onOpenChange={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('My Notes')).toBeInTheDocument();
    });

    // Click "New Folder" button
    fireEvent.click(screen.getByRole('button', { name: /new folder/i }));

    // Type a folder name
    const input = screen.getByPlaceholderText('Folder name');
    fireEvent.change(input, { target: { value: 'Study Materials' } });

    // Click "Create"
    fireEvent.click(screen.getByRole('button', { name: /create/i }));

    await waitFor(() => {
      expect(createFolder).toHaveBeenCalledWith({
        name: 'Study Materials',
        color: '#3B82F6',
        parent_id: null,
      });
    });
  });

  it('does not render when document is null', () => {
    render(<MoveDocumentDialog document={null} open onOpenChange={vi.fn()} />);

    // The dialog shell (DialogContent) still renders because open=true,
    // but the description references document?.title which is undefined,
    // and no data is fetched (useEffect guards on document).
    // We verify the tree content doesn't appear.
    expect(screen.queryByText('Calculus II')).not.toBeInTheDocument();
    expect(screen.queryByText('My Notes')).not.toBeInTheDocument();
  });
});
