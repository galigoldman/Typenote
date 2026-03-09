import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { CourseCard } from './course-card';
import type { Course } from '@/types/database';

const mockPush = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => '/dashboard',
}));

vi.mock('@/lib/actions/courses', () => ({
  createCourse: vi.fn(),
  updateCourse: vi.fn(),
  deleteCourse: vi.fn(),
}));

const mockCourse: Course = {
  id: 'course-1',
  user_id: 'user-1',
  folder_id: null,
  name: 'My Test Course',
  color: '#3B82F6',
  position: 0,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

describe('CourseCard', () => {
  it('renders the course name', () => {
    render(<CourseCard course={mockCourse} />);
    expect(screen.getByText('My Test Course')).toBeInTheDocument();
  });

  it('renders "Course" label', () => {
    render(<CourseCard course={mockCourse} />);
    expect(screen.getByText('Course')).toBeInTheDocument();
  });

  it('has a dropdown menu with Edit and Delete options', async () => {
    const user = userEvent.setup();
    render(<CourseCard course={mockCourse} />);

    const menuButton = screen.getByRole('button', {
      name: /course actions/i,
    });
    await user.click(menuButton);

    expect(screen.getByText('Edit')).toBeInTheDocument();
    expect(screen.getByText('Delete')).toBeInTheDocument();
  });

  it('navigates to the course page on click', async () => {
    const user = userEvent.setup();
    render(<CourseCard course={mockCourse} />);

    const card = screen.getByRole('button', { name: /my test course/i });
    await user.click(card);

    expect(mockPush).toHaveBeenCalledWith('/dashboard/courses/course-1');
  });

  it('navigates on keyboard Enter', async () => {
    const user = userEvent.setup();
    render(<CourseCard course={mockCourse} />);

    const card = screen.getByRole('button', { name: /my test course/i });
    card.focus();
    await user.keyboard('{Enter}');

    expect(mockPush).toHaveBeenCalledWith('/dashboard/courses/course-1');
  });
});
