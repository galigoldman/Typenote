import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { usePdfTextLayer } from './use-pdf-text-layer';

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
        getPage: vi.fn(() =>
          Promise.resolve({
            getViewport: vi.fn(() => ({ width: 612, height: 792 })),
            getTextContent: vi.fn(() =>
              Promise.resolve({ items: [], styles: {} }),
            ),
          }),
        ),
      }),
    })),
  },
}));

describe('usePdfTextLayer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exits early when both materialId and personalFileId are null', () => {
    const { result } = renderHook(() => usePdfTextLayer(null, 0));

    expect(result.current.loading).toBe(false);
    expect(result.current.textContent).toBeNull();
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

    renderHook(() => usePdfTextLayer('mat-123', 0));

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

    renderHook(() => usePdfTextLayer(null, 0, 'personal-file-123'));

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

    renderHook(() => usePdfTextLayer(null, 0, 'personal-file-456'));

    await waitFor(() => {
      expect(mockStorageFrom).toHaveBeenCalledWith('personal-files');
    });
  });
});
