import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { usePdfBackground } from './use-pdf-background';

// Mock Supabase client
const mockSingle = vi.fn();
const mockEq = vi.fn(() => ({ single: mockSingle }));
const mockSelect = vi.fn(() => ({ eq: mockEq }));
const mockFrom = vi.fn(() => ({ select: mockSelect }));
const mockCreateSignedUrl = vi.fn();
const mockStorageFrom = vi.fn(() => ({ createSignedUrl: mockCreateSignedUrl }));

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: mockFrom,
    storage: { from: mockStorageFrom },
  }),
}));

// Mock pdfjs-setup
vi.mock('@/lib/pdf/pdfjs-setup', () => ({
  pdfjsLib: {
    getDocument: vi.fn(() => ({
      promise: Promise.resolve({
        numPages: 3,
        destroy: vi.fn(),
        getPage: vi.fn(),
      }),
    })),
  },
}));

describe('usePdfBackground', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exits early and does not load when both materialId and personalFileId are null', () => {
    const { result } = renderHook(() => usePdfBackground(null));

    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.pageCount).toBe(0);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('queries course_materials table when materialId is provided', async () => {
    mockSingle.mockResolvedValue({
      data: { storage_path: 'uploads/test.pdf' },
      error: null,
    });
    mockCreateSignedUrl.mockResolvedValue({
      data: { signedUrl: 'https://example.com/signed-url' },
    });

    renderHook(() => usePdfBackground('mat-123'));

    await waitFor(() => {
      expect(mockFrom).toHaveBeenCalledWith('course_materials');
    });
  });

  it('queries personal_files table when personalFileId is provided', async () => {
    mockSingle.mockResolvedValue({
      data: { storage_path: 'uploads/personal.pdf' },
      error: null,
    });
    mockCreateSignedUrl.mockResolvedValue({
      data: { signedUrl: 'https://example.com/signed-url' },
    });

    renderHook(() =>
      usePdfBackground(null, undefined, 'personal-file-123'),
    );

    await waitFor(() => {
      expect(mockFrom).toHaveBeenCalledWith('personal_files');
      expect(mockStorageFrom).toHaveBeenCalledWith('personal-files');
    });
  });

  it('uses personal-files storage bucket for personal file PDFs', async () => {
    mockSingle.mockResolvedValue({
      data: { storage_path: 'user123/doc.pdf' },
      error: null,
    });
    mockCreateSignedUrl.mockResolvedValue({
      data: { signedUrl: 'https://example.com/signed-url' },
    });

    renderHook(() =>
      usePdfBackground(null, undefined, 'personal-file-456'),
    );

    await waitFor(() => {
      expect(mockStorageFrom).toHaveBeenCalledWith('personal-files');
    });
  });

  it('uses course-materials bucket for non-moodle course materials', async () => {
    mockSingle.mockResolvedValue({
      data: { storage_path: 'uploads/course.pdf' },
      error: null,
    });
    mockCreateSignedUrl.mockResolvedValue({
      data: { signedUrl: 'https://example.com/signed-url' },
    });

    renderHook(() => usePdfBackground('mat-789'));

    await waitFor(() => {
      expect(mockFrom).toHaveBeenCalledWith('course_materials');
      expect(mockStorageFrom).toHaveBeenCalledWith('course-materials');
    });
  });

  it('prefers materialId over personalFileId when both are provided', async () => {
    mockSingle.mockResolvedValue({
      data: { storage_path: 'uploads/course.pdf' },
      error: null,
    });
    mockCreateSignedUrl.mockResolvedValue({
      data: { signedUrl: 'https://example.com/signed-url' },
    });

    renderHook(() =>
      usePdfBackground('mat-123', undefined, 'personal-file-456'),
    );

    await waitFor(() => {
      expect(mockFrom).toHaveBeenCalledWith('course_materials');
    });
  });
});
