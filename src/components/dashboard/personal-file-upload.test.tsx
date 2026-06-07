import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PersonalFileUpload } from './personal-file-upload';
import { createPersonalFile } from '@/lib/actions/personal-files';
import { toast } from 'sonner';

const uploadMock = vi.fn();

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    storage: {
      from: () => ({ upload: uploadMock }),
    },
  }),
}));

vi.mock('@/lib/actions/personal-files', () => ({
  createPersonalFile: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/lib/analytics/events', () => ({
  trackEvent: vi.fn(),
}));

/** A promise whose resolution the test controls. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function selectPdf(container: HTMLElement) {
  const input = container.querySelector('input[type="file"]')!;
  const file = new File(['%PDF-1.4'], 'notes.pdf', {
    type: 'application/pdf',
  });
  fireEvent.change(input, { target: { files: [file] } });
}

describe('PersonalFileUpload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the import button when idle', () => {
    render(
      <PersonalFileUpload courseId="c1" userId="u1" category="material" />,
    );
    expect(
      screen.getByRole('button', { name: /import file/i }),
    ).toBeInTheDocument();
  });

  it('shows "Uploading..." while the storage upload is in progress', async () => {
    const upload = deferred<{ error: null }>();
    uploadMock.mockReturnValue(upload.promise);

    const { container } = render(
      <PersonalFileUpload courseId="c1" userId="u1" category="material" />,
    );
    selectPdf(container);

    expect(await screen.findByText(/uploading/i)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /import file/i }),
    ).not.toBeInTheDocument();

    upload.resolve({ error: null });
  });

  it('shows "Processing file..." while indexing runs after the upload completes', async () => {
    uploadMock.mockResolvedValue({ error: null });
    const processing = deferred<unknown>();
    vi.mocked(createPersonalFile).mockReturnValue(
      processing.promise as ReturnType<typeof createPersonalFile>,
    );

    const { container } = render(
      <PersonalFileUpload courseId="c1" userId="u1" category="material" />,
    );
    selectPdf(container);

    expect(await screen.findByText(/processing file/i)).toBeInTheDocument();
    expect(screen.queryByText(/uploading/i)).not.toBeInTheDocument();
    // Button stays hidden through the processing phase
    expect(
      screen.queryByRole('button', { name: /import file/i }),
    ).not.toBeInTheDocument();

    processing.resolve({});
  });

  it('restores the button and shows a success toast when the whole flow completes', async () => {
    uploadMock.mockResolvedValue({ error: null });
    vi.mocked(createPersonalFile).mockResolvedValue(
      {} as Awaited<ReturnType<typeof createPersonalFile>>,
    );

    const { container } = render(
      <PersonalFileUpload courseId="c1" userId="u1" category="material" />,
    );
    selectPdf(container);

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /import file/i }),
      ).toBeInTheDocument(),
    );
    expect(toast.success).toHaveBeenCalledWith('File imported');
  });

  it('restores the button and shows an error toast when the upload fails', async () => {
    uploadMock.mockResolvedValue({ error: new Error('storage down') });

    const { container } = render(
      <PersonalFileUpload courseId="c1" userId="u1" category="material" />,
    );
    selectPdf(container);

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(
      screen.getByRole('button', { name: /import file/i }),
    ).toBeInTheDocument();
    expect(createPersonalFile).not.toHaveBeenCalled();
  });

  it('restores the button and shows an error toast when processing fails', async () => {
    uploadMock.mockResolvedValue({ error: null });
    vi.mocked(createPersonalFile).mockRejectedValue(new Error('index failed'));

    const { container } = render(
      <PersonalFileUpload courseId="c1" userId="u1" category="material" />,
    );
    selectPdf(container);

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('index failed'),
    );
    expect(
      screen.getByRole('button', { name: /import file/i }),
    ).toBeInTheDocument();
  });
});
