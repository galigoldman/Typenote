import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MaterialUpload } from './material-upload';
import { useFileUpload } from '@/hooks/use-file-upload';

const mockUpload = vi.fn().mockResolvedValue('path');
const mockReset = vi.fn();

vi.mock('@/hooks/use-file-upload', () => ({
  useFileUpload: vi.fn(),
}));

const mockCreateCourseMaterial = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/actions/course-materials', () => ({
  createCourseMaterial: (...args: unknown[]) =>
    mockCreateCourseMaterial(...args),
}));

const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

const defaultProps = {
  weekId: 'week-1',
  courseId: 'course-1',
  userId: 'user-1',
  category: 'material' as const,
};

describe('MaterialUpload', () => {
  beforeEach(() => {
    vi.mocked(useFileUpload).mockReturnValue({
      uploading: false,
      progress: 0,
      error: null,
      upload: mockUpload,
      reset: mockReset,
      validateFile: vi.fn().mockReturnValue(null),
    });
  });

  it('renders "Add Material" button when category is material', () => {
    render(<MaterialUpload {...defaultProps} category="material" />);
    expect(
      screen.getByRole('button', { name: /add material/i }),
    ).toBeInTheDocument();
  });

  it('renders "Add Homework" button when category is homework', () => {
    render(<MaterialUpload {...defaultProps} category="homework" />);
    expect(
      screen.getByRole('button', { name: /add homework/i }),
    ).toBeInTheDocument();
  });

  it('has a hidden file input that accepts PDF', () => {
    const { container } = render(<MaterialUpload {...defaultProps} />);
    const input = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    expect(input).toBeInTheDocument();
    expect(input).toHaveClass('hidden');
    expect(input).toHaveAttribute('accept', '.pdf,application/pdf');
  });

  it('shows progress bar when uploading', () => {
    vi.mocked(useFileUpload).mockReturnValue({
      uploading: true,
      progress: 50,
      error: null,
      upload: mockUpload,
      reset: mockReset,
      validateFile: vi.fn().mockReturnValue(null),
    });

    render(<MaterialUpload {...defaultProps} />);
    expect(screen.getByText(/uploading/i)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /add material/i }),
    ).not.toBeInTheDocument();
  });

  it('shows error message when error exists', () => {
    vi.mocked(useFileUpload).mockReturnValue({
      uploading: false,
      progress: 0,
      error: 'Upload failed',
      upload: mockUpload,
      reset: mockReset,
      validateFile: vi.fn().mockReturnValue(null),
    });

    render(<MaterialUpload {...defaultProps} />);
    expect(screen.getByText('Upload failed')).toBeInTheDocument();
  });

  it('calls upload and createCourseMaterial on file selection via input', async () => {
    mockUpload.mockClear();
    mockCreateCourseMaterial.mockClear();
    mockToastSuccess.mockClear();

    const { container } = render(<MaterialUpload {...defaultProps} />);
    const input = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;

    const file = new File(['pdf-content'], 'test.pdf', {
      type: 'application/pdf',
    });

    await userEvent.upload(input, file);

    await waitFor(() => {
      expect(mockUpload).toHaveBeenCalledWith(
        file,
        'user-1/course-1/week-1/test.pdf',
      );
    });

    await waitFor(() => {
      expect(mockCreateCourseMaterial).toHaveBeenCalledWith({
        week_id: 'week-1',
        category: 'material',
        storage_path: 'user-1/course-1/week-1/test.pdf',
        file_name: 'test.pdf',
        file_size: file.size,
        mime_type: 'application/pdf',
      });
    });

    await waitFor(() => {
      expect(mockToastSuccess).toHaveBeenCalledWith('Material uploaded');
    });
  });
});
