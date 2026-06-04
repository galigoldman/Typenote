import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CourseCard } from '../course-card';
import type { Course } from '@/types/database';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock('@/lib/actions/courses', () => ({ deleteCourse: vi.fn() }));
vi.mock('@/lib/actions/course-sharing', () => ({ leaveCourse: vi.fn() }));

const course: Course = {
  id: 'c1',
  user_id: 'owner-A',
  folder_id: null,
  name: 'Shared Course',
  color: '#6B7280',
  position: 0,
  created_at: '',
  updated_at: '',
};

describe('CourseCard shared mode', () => {
  it('renders a Shared badge and owner name when shared=true', () => {
    render(<CourseCard course={course} shared ownerName="Alice" />);
    // Use getAllByText because the course name "Shared Course" also matches /shared/i
    const sharedMatches = screen.getAllByText(/shared/i);
    expect(sharedMatches.length).toBeGreaterThanOrEqual(1);
    // The badge specifically contains only the word "Shared"
    expect(sharedMatches.some((el) => el.textContent === 'Shared')).toBe(true);
    expect(screen.getByText(/alice/i)).toBeInTheDocument();
  });
});
