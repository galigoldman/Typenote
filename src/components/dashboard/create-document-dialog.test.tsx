import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { CreateDocumentDialog } from './create-document-dialog';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/lib/actions/documents', () => ({
  createDocument: vi.fn().mockResolvedValue({ id: 'new-doc-1' }),
}));

describe('CreateDocumentDialog', () => {
  function renderDialog() {
    // Render with defaultOpen to skip Radix pointer event issues
    render(
      <CreateDocumentDialog defaultOpen>
        <button>New Document</button>
      </CreateDocumentDialog>,
    );
  }

  it('renders dialog with title field', () => {
    renderDialog();
    expect(screen.getByLabelText(/title/i)).toBeInTheDocument();
  });

  it('renders dialog with default title value "Untitled"', () => {
    renderDialog();
    expect(screen.getByLabelText(/title/i)).toHaveValue('Untitled');
  });

  it('renders subject select trigger', () => {
    renderDialog();
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('renders canvas type options', () => {
    renderDialog();
    expect(screen.getByText('Blank')).toBeInTheDocument();
    expect(screen.getByText('Lined')).toBeInTheDocument();
    expect(screen.getByText('Grid')).toBeInTheDocument();
    expect(screen.getByText('Dotted')).toBeInTheDocument();
  });

  it('renders Create and Cancel buttons', () => {
    renderDialog();
    expect(screen.getByRole('button', { name: /create/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
  });

  it('does not show custom subject input by default', () => {
    renderDialog();
    expect(screen.queryByLabelText(/custom subject/i)).not.toBeInTheDocument();
  });
});
