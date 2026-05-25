import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HomeworkContextChip } from '@/components/dashboard/homework-context-chip';
import type { HomeworkContext } from '@/types/database';

const ctx: HomeworkContext = {
  session: {
    id: 's1', document_id: 'd1', exercise_document_id: 'ex1',
    exercise_type: null, exercise_id: null,
    course_id: 'c1', user_id: 'u1', created_at: '2026-01-01',
  },
  exerciseDocument: { id: 'ex1', title: 'Problem Set 1' },
  materials: [
    { type: 'course_material', id: 'm1', name: 'Lecture 1' },
    { type: 'moodle_file', id: 'm2', name: 'syllabus.pdf' },
  ],
};

describe('HomeworkContextChip', () => {
  it('renders the exercise title and pinned material names', () => {
    render(<HomeworkContextChip context={ctx} />);
    expect(screen.getByText(/Problem Set 1/)).toBeInTheDocument();
    expect(screen.getByText(/Lecture 1/)).toBeInTheDocument();
    expect(screen.getByText(/syllabus\.pdf/)).toBeInTheDocument();
  });

  it('renders without materials gracefully', () => {
    render(<HomeworkContextChip context={{ ...ctx, materials: [] }} />);
    expect(screen.getByText(/Problem Set 1/)).toBeInTheDocument();
  });
});
