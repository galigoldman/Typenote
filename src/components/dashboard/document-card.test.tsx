import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { DocumentCard } from './document-card';
import type { Document } from '@/types/database';

const mockPush = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockDocument: Document = {
  id: 'doc-1',
  user_id: 'user-1',
  folder_id: null,
  course_id: null,
  week_id: null,
  purpose: null,
  title: 'Integration by Parts',
  content: {},
  subject: 'calculus',
  subject_custom: null,
  canvas_type: 'lined',
  position: 0,
  created_at: '2026-03-01T00:00:00Z',
  updated_at: '2026-03-05T12:00:00Z',
};

describe('DocumentCard', () => {
  it('renders the document title', () => {
    render(<DocumentCard document={mockDocument} />);
    expect(screen.getByText('Integration by Parts')).toBeInTheDocument();
  });

  it('renders a subject badge with the correct label', () => {
    render(<DocumentCard document={mockDocument} />);
    const badge = screen.getByTestId('subject-badge');
    expect(badge).toHaveTextContent('Calculus');
  });

  it('renders custom subject label when subject is "other"', () => {
    const doc: Document = {
      ...mockDocument,
      subject: 'other',
      subject_custom: 'Biology',
    };
    render(<DocumentCard document={doc} />);
    const badge = screen.getByTestId('subject-badge');
    expect(badge).toHaveTextContent('Biology');
  });

  it('renders last edited relative time', () => {
    render(<DocumentCard document={mockDocument} />);
    // The relative time text should be present (exact value depends on current time)
    const description = screen.getByText(/ago|just now/i);
    expect(description).toBeInTheDocument();
  });

  it('has a dropdown with Rename, Move, and Delete options', async () => {
    const user = userEvent.setup();
    render(<DocumentCard document={mockDocument} />);

    const menuButton = screen.getByRole('button', {
      name: /document options/i,
    });
    await user.click(menuButton);

    expect(screen.getByText('Rename')).toBeInTheDocument();
    expect(screen.getByText('Move')).toBeInTheDocument();
    expect(screen.getByText('Delete')).toBeInTheDocument();
  });

  it('calls onRename when Rename is clicked', async () => {
    const user = userEvent.setup();
    const onRename = vi.fn();
    render(<DocumentCard document={mockDocument} onRename={onRename} />);

    const menuButton = screen.getByRole('button', {
      name: /document options/i,
    });
    await user.click(menuButton);
    await user.click(screen.getByText('Rename'));

    expect(onRename).toHaveBeenCalledWith('doc-1');
  });

  it('calls onDelete when Delete is clicked', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    render(<DocumentCard document={mockDocument} onDelete={onDelete} />);

    const menuButton = screen.getByRole('button', {
      name: /document options/i,
    });
    await user.click(menuButton);
    await user.click(screen.getByText('Delete'));

    expect(onDelete).toHaveBeenCalledWith('doc-1');
  });
});
