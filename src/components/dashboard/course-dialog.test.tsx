import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { CourseDialog } from './course-dialog';
import type { Course } from '@/types/database';

vi.mock('@/lib/actions/courses', () => ({
  createCourse: vi.fn().mockResolvedValue(undefined),
  updateCourse: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/dashboard',
}));

const mockCourse: Course = {
  id: 'course-1',
  user_id: 'user-1',
  folder_id: 'folder-1',
  name: 'Calculus II',
  color: '#EF4444',
  position: 0,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

describe('CourseDialog', () => {
  it('renders "New Course" button in create mode', () => {
    render(<CourseDialog folderId={null} />);
    expect(
      screen.getByRole('button', { name: /new course/i }),
    ).toBeInTheDocument();
  });

  it('opens dialog showing "Create Course" title when trigger clicked', async () => {
    const user = userEvent.setup();
    render(<CourseDialog folderId={null} />);

    await user.click(screen.getByRole('button', { name: /new course/i }));

    expect(
      screen.getByRole('heading', { name: /create course/i }),
    ).toBeInTheDocument();
  });

  it('shows validation error when submitting with empty name', async () => {
    const user = userEvent.setup();
    render(<CourseDialog folderId={null} open onOpenChange={vi.fn()} />);

    const submitButton = screen.getByRole('button', {
      name: /create course/i,
    });
    await user.click(submitButton);

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Course name is required',
    );
  });

  it('calls createCourse with correct data on submit', async () => {
    const { createCourse } = await import('@/lib/actions/courses');
    const user = userEvent.setup();

    render(<CourseDialog folderId="folder-1" open onOpenChange={vi.fn()} />);

    await user.type(screen.getByLabelText(/name/i), 'Data Structures');

    const submitButton = screen.getByRole('button', {
      name: /create course/i,
    });
    await user.click(submitButton);

    expect(createCourse).toHaveBeenCalledWith({
      name: 'Data Structures',
      color: '#3B82F6',
      folder_id: 'folder-1',
    });
  });

  it('pre-fills form fields in edit mode', () => {
    render(
      <CourseDialog
        folderId="folder-1"
        course={mockCourse}
        open
        onOpenChange={vi.fn()}
      />,
    );

    expect(screen.getByLabelText(/name/i)).toHaveValue('Calculus II');
  });

  it('shows "Edit Course" title in edit mode', () => {
    render(
      <CourseDialog
        folderId="folder-1"
        course={mockCourse}
        open
        onOpenChange={vi.fn()}
      />,
    );

    expect(
      screen.getByRole('heading', { name: /edit course/i }),
    ).toBeInTheDocument();
  });

  it('calls updateCourse with correct data in edit mode', async () => {
    const { updateCourse } = await import('@/lib/actions/courses');
    const user = userEvent.setup();

    render(
      <CourseDialog
        folderId="folder-1"
        course={mockCourse}
        open
        onOpenChange={vi.fn()}
      />,
    );

    const nameInput = screen.getByLabelText(/name/i);
    await user.clear(nameInput);
    await user.type(nameInput, 'Calculus III');

    const submitButton = screen.getByRole('button', {
      name: /save changes/i,
    });
    await user.click(submitButton);

    expect(updateCourse).toHaveBeenCalledWith('course-1', {
      name: 'Calculus III',
      color: '#EF4444',
    });
  });

  it('renders 8 color picker buttons', () => {
    render(<CourseDialog folderId={null} open onOpenChange={vi.fn()} />);

    const colorButtons = screen.getAllByRole('button', {
      name: /select color #/i,
    });
    expect(colorButtons).toHaveLength(8);
  });
});
