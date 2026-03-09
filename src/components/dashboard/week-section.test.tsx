import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { WeekSection } from './week-section';
import type { CourseWeek, CourseMaterial } from '@/types/database';

vi.mock('@/lib/actions/course-weeks', () => ({
  createCourseWeek: vi.fn(),
  updateCourseWeek: vi.fn(),
  deleteCourseWeek: vi.fn(),
}));

vi.mock('@/lib/actions/course-materials', () => ({
  createCourseMaterial: vi.fn(),
  updateCourseMaterial: vi.fn(),
  deleteCourseMaterial: vi.fn(),
}));

vi.mock('@/hooks/use-file-upload', () => ({
  useFileUpload: () => ({
    uploading: false,
    progress: 0,
    error: null,
    upload: vi.fn(),
    reset: vi.fn(),
  }),
}));

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    storage: {
      from: () => ({
        createSignedUrl: vi.fn().mockResolvedValue({
          data: { signedUrl: 'https://example.com/file.pdf' },
        }),
      }),
    },
  }),
}));

const mockWeek: CourseWeek = {
  id: 'week-1',
  course_id: 'course-1',
  user_id: 'user-1',
  week_number: 3,
  topic: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const mockMaterials: CourseMaterial[] = [
  {
    id: 'mat-1',
    week_id: 'week-1',
    user_id: 'user-1',
    category: 'material',
    storage_path: 'user-1/course-1/week-1/lecture-notes.pdf',
    file_name: 'lecture-notes.pdf',
    label: 'Lecture Notes',
    file_size: 2048,
    mime_type: 'application/pdf',
    created_at: '2026-01-02T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z',
  },
  {
    id: 'mat-2',
    week_id: 'week-1',
    user_id: 'user-1',
    category: 'material',
    storage_path: 'user-1/course-1/week-1/slides.pdf',
    file_name: 'slides.pdf',
    label: null,
    file_size: 4096,
    mime_type: 'application/pdf',
    created_at: '2026-01-03T00:00:00Z',
    updated_at: '2026-01-03T00:00:00Z',
  },
];

const mockHomework: CourseMaterial[] = [
  {
    id: 'hw-1',
    week_id: 'week-1',
    user_id: 'user-1',
    category: 'homework',
    storage_path: 'user-1/course-1/week-1/assignment-1.pdf',
    file_name: 'assignment-1.pdf',
    label: 'Assignment 1',
    file_size: 1024,
    mime_type: 'application/pdf',
    created_at: '2026-01-04T00:00:00Z',
    updated_at: '2026-01-04T00:00:00Z',
  },
];

describe('WeekSection', () => {
  const defaultProps = {
    week: mockWeek,
    courseId: 'course-1',
    userId: 'user-1',
    materials: [],
    homework: [],
  };

  it('renders week number in header', () => {
    render(<WeekSection {...defaultProps} />);
    expect(screen.getByText('Week 3')).toBeInTheDocument();
  });

  it('renders week number with topic', () => {
    const weekWithTopic = { ...mockWeek, topic: 'Derivatives' };
    render(<WeekSection {...defaultProps} week={weekWithTopic} />);
    expect(screen.getByText('Week 3: Derivatives')).toBeInTheDocument();
  });

  it('shows "Materials" and "Homework" section headings when expanded (default)', () => {
    render(<WeekSection {...defaultProps} />);
    expect(screen.getByText('Materials')).toBeInTheDocument();
    expect(screen.getByText('Homework')).toBeInTheDocument();
  });

  it('collapses content when toggle is clicked', async () => {
    const user = userEvent.setup();
    render(<WeekSection {...defaultProps} />);

    // Sections should be visible by default
    expect(screen.getByText('Materials')).toBeInTheDocument();
    expect(screen.getByText('Homework')).toBeInTheDocument();

    // Click the toggle button (the button containing the week number heading)
    const toggle = screen.getByText('Week 3').closest('button')!;
    await user.click(toggle);

    // Sections should be hidden after collapse
    expect(screen.queryByText('Materials')).not.toBeInTheDocument();
    expect(screen.queryByText('Homework')).not.toBeInTheDocument();
  });

  it('has dropdown with Edit and Delete options', async () => {
    const user = userEvent.setup();
    render(<WeekSection {...defaultProps} />);

    // Open the dropdown menu by clicking the MoreHorizontal trigger button
    const menuTrigger = screen.getByRole('button', { name: '' });
    await user.click(menuTrigger);

    expect(screen.getByText('Edit')).toBeInTheDocument();
    expect(screen.getByText('Delete')).toBeInTheDocument();
  });

  it('renders material items when materials are provided', () => {
    render(<WeekSection {...defaultProps} materials={mockMaterials} />);

    // First material has a label so it should display the label
    expect(screen.getByText('Lecture Notes')).toBeInTheDocument();
    // Second material has no label so it should display the file name
    expect(screen.getByText('slides.pdf')).toBeInTheDocument();
  });

  it('renders homework items when homework is provided', () => {
    render(<WeekSection {...defaultProps} homework={mockHomework} />);

    expect(screen.getByText('Assignment 1')).toBeInTheDocument();
  });
});
