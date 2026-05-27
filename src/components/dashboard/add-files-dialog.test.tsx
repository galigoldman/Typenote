import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AddFilesDialog } from './add-files-dialog';
import { getAttachableFiles } from '@/lib/actions/context-files';
import type { AttachableFile } from '@/types/database';

vi.mock('@/lib/actions/context-files', () => ({
  getAttachableFiles: vi.fn(),
}));

const moodle: AttachableFile = {
  fileType: 'moodle_file',
  fileId: 'm1',
  name: 'HW3.pdf',
  mimeType: 'application/pdf',
};
const syllabus: AttachableFile = {
  fileType: 'course_material',
  fileId: 'c1',
  name: 'Syllabus.pdf',
  mimeType: 'application/pdf',
};
const cheatsheet: AttachableFile = {
  fileType: 'course_material',
  fileId: 'c2',
  name: 'Cheatsheet.docx',
  mimeType: null,
};
const personal: AttachableFile = {
  fileType: 'personal_file',
  fileId: 'p1',
  name: 'notes.pdf',
  mimeType: 'application/pdf',
};

beforeEach(() => {
  vi.mocked(getAttachableFiles).mockResolvedValue({
    moodleFiles: [moodle],
    courseMaterials: [syllabus, cheatsheet],
    personalFiles: [personal],
  });
});

function renderDialog(
  props: Partial<React.ComponentProps<typeof AddFilesDialog>> = {},
) {
  const onConfirm = props.onConfirm ?? vi.fn().mockResolvedValue(undefined);
  const onOpenChange = props.onOpenChange ?? vi.fn();
  render(
    <AddFilesDialog
      open
      onOpenChange={onOpenChange}
      courseId="course-1"
      alreadyAttached={props.alreadyAttached ?? []}
      onConfirm={onConfirm}
    />,
  );
  return { onConfirm, onOpenChange };
}

describe('AddFilesDialog', () => {
  it('renders candidates grouped by source', async () => {
    renderDialog();
    await waitFor(() =>
      expect(screen.getByText('HW3.pdf')).toBeInTheDocument(),
    );
    expect(screen.getByText('From Moodle')).toBeInTheDocument();
    expect(screen.getByText('Course materials')).toBeInTheDocument();
    expect(screen.getByText('Personal uploads')).toBeInTheDocument();
    expect(screen.getByText('Syllabus.pdf')).toBeInTheDocument();
  });

  it('filters candidates by the search query', async () => {
    renderDialog();
    await waitFor(() =>
      expect(screen.getByText('HW3.pdf')).toBeInTheDocument(),
    );

    fireEvent.change(screen.getByLabelText('Search files'), {
      target: { value: 'cheat' },
    });

    expect(screen.getByText('Cheatsheet.docx')).toBeInTheDocument();
    expect(screen.queryByText('HW3.pdf')).not.toBeInTheDocument();
    expect(screen.queryByText('Syllabus.pdf')).not.toBeInTheDocument();
  });

  it('marks already-attached files as added and disabled', async () => {
    renderDialog({
      alreadyAttached: [{ fileType: 'course_material', fileId: 'c1' }],
    });
    await waitFor(() =>
      expect(screen.getByText('Syllabus.pdf')).toBeInTheDocument(),
    );
    expect(screen.getByText('added')).toBeInTheDocument();
    // The Syllabus row button is disabled.
    const row = screen.getByText('Syllabus.pdf').closest('button');
    expect(row).toBeDisabled();
  });

  it('enables "Add N files" only after selecting, and confirms the selection', async () => {
    const { onConfirm, onOpenChange } = renderDialog();
    await waitFor(() =>
      expect(screen.getByText('HW3.pdf')).toBeInTheDocument(),
    );

    // No selection → the confirm button reads "Add files" and is disabled.
    const addButton = screen.getByRole('button', { name: 'Add files' });
    expect(addButton).toBeDisabled();

    // Select HW3.pdf.
    fireEvent.click(screen.getByText('HW3.pdf'));

    const addOne = screen.getByRole('button', { name: 'Add 1 file' });
    expect(addOne).toBeEnabled();
    fireEvent.click(addOne);

    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    expect(onConfirm).toHaveBeenCalledWith([
      expect.objectContaining({ fileId: 'm1', fileType: 'moodle_file' }),
    ]);
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('shows an error and keeps the dialog open when confirm fails', async () => {
    const onConfirm = vi
      .fn()
      .mockRejectedValue(new Error("Couldn't add: HW3.pdf"));
    const onOpenChange = vi.fn();
    renderDialog({ onConfirm, onOpenChange });
    await waitFor(() =>
      expect(screen.getByText('HW3.pdf')).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByText('HW3.pdf'));
    fireEvent.click(screen.getByRole('button', { name: 'Add 1 file' }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        "Couldn't add: HW3.pdf",
      ),
    );
    // Dialog was not asked to close.
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
