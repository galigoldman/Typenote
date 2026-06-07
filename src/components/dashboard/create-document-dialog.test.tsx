import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CreateDocumentDialog } from './create-document-dialog';
import { createDocument } from '@/lib/actions/documents';

const mockPush = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
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

  it('does not render a subject selector (removed at creation time)', () => {
    renderDialog();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByText(/^subject$/i)).not.toBeInTheDocument();
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

  describe('loading state during create + navigation', () => {
    beforeEach(() => {
      mockPush.mockClear();
      vi.mocked(createDocument).mockResolvedValue({
        id: 'new-doc-1',
      } as Awaited<ReturnType<typeof createDocument>>);
    });

    it('keeps the dialog open with a disabled "Creating..." button after a successful create, until navigation unmounts it', async () => {
      renderDialog();
      await userEvent.click(screen.getByRole('button', { name: /^create$/i }));

      expect(mockPush).toHaveBeenCalledWith('/dashboard/documents/new-doc-1');
      // Dialog must still be visible — navigation to the editor is in flight
      expect(screen.getByLabelText(/title/i)).toBeInTheDocument();
      const submit = screen.getByRole('button', { name: /creating/i });
      expect(submit).toBeDisabled();
    });

    it('disables Cancel while the document is being created', async () => {
      let resolveCreate: (v: { id: string }) => void;
      vi.mocked(createDocument).mockImplementation(
        () =>
          new Promise((res) => {
            resolveCreate = res;
          }) as ReturnType<typeof createDocument>,
      );
      renderDialog();
      await userEvent.click(screen.getByRole('button', { name: /^create$/i }));

      expect(screen.getByRole('button', { name: /cancel/i })).toBeDisabled();
      resolveCreate!({ id: 'new-doc-1' });
    });

    it('re-enables the form and shows the error when creation fails', async () => {
      vi.mocked(createDocument).mockRejectedValue(new Error('boom'));
      renderDialog();
      await userEvent.click(screen.getByRole('button', { name: /^create$/i }));

      expect(screen.getByRole('alert')).toHaveTextContent('boom');
      expect(screen.getByRole('button', { name: /^create$/i })).toBeEnabled();
      expect(mockPush).not.toHaveBeenCalled();
    });
  });
});
