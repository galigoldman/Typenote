import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChatFocusFiles } from './chat-focus-files';
import { detachContextFile } from '@/lib/actions/context-files';
import type { ResolvedContextFile } from '@/types/database';

vi.mock('@/lib/actions/context-files', () => ({
  detachContextFile: vi.fn().mockResolvedValue(undefined),
  attachContextFile: vi.fn().mockResolvedValue(undefined),
  getAttachableFiles: vi.fn().mockResolvedValue({
    moodleFiles: [],
    courseMaterials: [],
    personalFiles: [],
  }),
}));

function makeFiles(n: number): ResolvedContextFile[] {
  return Array.from({ length: n }, (_, i) => ({
    fileType: 'course_material' as const,
    fileId: `c${i}`,
    name: `File ${i}.pdf`,
    mimeType: 'application/pdf',
  }));
}

function renderChat(files: ResolvedContextFile[], onChanged = vi.fn()) {
  render(
    <ChatFocusFiles
      documentId="doc-1"
      courseId="course-1"
      files={files}
      onChanged={onChanged}
    />,
  );
  return { onChanged };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ChatFocusFiles', () => {
  it('shows an explanation and an add affordance when empty', () => {
    renderChat([]);
    expect(screen.getByTestId('chat-focus-add')).toBeInTheDocument();
    // The explanation tooltip is present.
    expect(screen.getByTitle(/prioritizes these files/i)).toBeInTheDocument();
    expect(screen.queryByTestId('chat-focus-chip')).not.toBeInTheDocument();
  });

  it('renders a chip per file when under the cap', () => {
    renderChat(makeFiles(2));
    expect(screen.getAllByTestId('chat-focus-chip')).toHaveLength(2);
    expect(screen.queryByText(/more$/)).not.toBeInTheDocument();
  });

  it('caps visible chips and expands on "+N more"', () => {
    renderChat(makeFiles(6));
    // Only 4 visible, with a "+2 more" control.
    expect(screen.getAllByTestId('chat-focus-chip')).toHaveLength(4);
    const more = screen.getByText('+2 more');
    fireEvent.click(more);
    expect(screen.getAllByTestId('chat-focus-chip')).toHaveLength(6);
    expect(screen.getByText('show less')).toBeInTheDocument();
  });

  it('detaches a file and notifies the host', async () => {
    const { onChanged } = renderChat(makeFiles(2));
    fireEvent.click(screen.getByRole('button', { name: 'Remove File 0.pdf' }));
    await waitFor(() => expect(detachContextFile).toHaveBeenCalledTimes(1));
    expect(detachContextFile).toHaveBeenCalledWith({
      documentId: 'doc-1',
      fileType: 'course_material',
      fileId: 'c0',
    });
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });
});
