/**
 * Tests for useFileUpload.
 *
 * Covers:
 *   - validateFile rejects unsupported MIME types
 *   - validateFile rejects files >50 MB
 *   - validateFile accepts allowed types under the cap
 *   - upload short-circuits when validation fails (no network, error state set)
 *   - upload sets uploading state, then sets progress=100 on success
 *   - upload exposes Supabase errors to callers and updates state
 *   - reset clears state
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const mockUpload = vi.fn();
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    storage: {
      from: () => ({ upload: mockUpload }),
    },
  }),
}));

import { useFileUpload } from '../use-file-upload';

function makeFile(opts: { name: string; type: string; size: number }) {
  const f = new File(['x'.repeat(Math.min(opts.size, 1024))], opts.name, {
    type: opts.type,
  });
  // Override size for tests that need to simulate huge files cheaply.
  Object.defineProperty(f, 'size', {
    configurable: true,
    get: () => opts.size,
  });
  return f;
}

describe('useFileUpload — validation', () => {
  it('rejects a non-PDF MIME type with the default allowlist', () => {
    const { result } = renderHook(() => useFileUpload('test-bucket'));
    const error = result.current.validateFile(
      makeFile({ name: 'note.txt', type: 'text/plain', size: 1024 }),
    );
    expect(error).toMatch(/Accepted file types/i);
    expect(error).toMatch(/pdf/i);
  });

  it('rejects a file larger than the 50 MB cap', () => {
    const { result } = renderHook(() => useFileUpload('test-bucket'));
    const error = result.current.validateFile(
      makeFile({
        name: 'huge.pdf',
        type: 'application/pdf',
        size: 51 * 1024 * 1024,
      }),
    );
    expect(error).toMatch(/under 50MB/i);
  });

  it('accepts a PDF under 50 MB', () => {
    const { result } = renderHook(() => useFileUpload('test-bucket'));
    const error = result.current.validateFile(
      makeFile({ name: 'ok.pdf', type: 'application/pdf', size: 1024 }),
    );
    expect(error).toBeNull();
  });

  it('honors a custom allow-list', () => {
    const { result } = renderHook(() =>
      useFileUpload('test-bucket', [
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ]),
    );
    const pdfError = result.current.validateFile(
      makeFile({ name: 'note.pdf', type: 'application/pdf', size: 1024 }),
    );
    const docxError = result.current.validateFile(
      makeFile({
        name: 'note.docx',
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        size: 1024,
      }),
    );
    expect(pdfError).toMatch(/Accepted file types/i);
    expect(docxError).toBeNull();
  });
});

describe('useFileUpload — upload flow', () => {
  beforeEach(() => {
    mockUpload.mockReset();
  });

  it('short-circuits on validation failure with no storage call', async () => {
    mockUpload.mockResolvedValue({ error: null });

    const { result } = renderHook(() => useFileUpload('test-bucket'));
    const badFile = makeFile({
      name: 'note.txt',
      type: 'text/plain',
      size: 1024,
    });

    let thrown: unknown;
    await act(async () => {
      try {
        await result.current.upload(badFile, 'whatever/note.txt');
      } catch (e) {
        thrown = e;
      }
    });

    expect((thrown as Error).message).toMatch(/Accepted file types/i);
    expect(mockUpload).not.toHaveBeenCalled();
    expect(result.current.uploading).toBe(false);
    expect(String(result.current.error)).toMatch(/Accepted file types/i);
  });

  it('calls storage.upload and sets progress=100 on success', async () => {
    mockUpload.mockResolvedValue({ error: null });

    const { result } = renderHook(() => useFileUpload('test-bucket'));
    const goodFile = makeFile({
      name: 'ok.pdf',
      type: 'application/pdf',
      size: 1024,
    });

    let returnedPath: string | undefined;
    await act(async () => {
      returnedPath = await result.current.upload(goodFile, 'docs/ok.pdf');
    });

    expect(mockUpload).toHaveBeenCalledTimes(1);
    expect(mockUpload.mock.calls[0][0]).toBe('docs/ok.pdf');
    expect(returnedPath).toBe('docs/ok.pdf');
    expect(result.current.progress).toBe(100);
    expect(result.current.uploading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('surfaces Supabase errors and resets uploading state', async () => {
    // Supabase storage errors thrown from .upload are real Error instances.
    mockUpload.mockResolvedValue({
      error: new Error('duplicate key'),
    });

    const { result } = renderHook(() => useFileUpload('test-bucket'));
    const goodFile = makeFile({
      name: 'dup.pdf',
      type: 'application/pdf',
      size: 1024,
    });

    let thrown: unknown;
    await act(async () => {
      try {
        await result.current.upload(goodFile, 'docs/dup.pdf');
      } catch (e) {
        thrown = e;
      }
    });

    expect((thrown as Error).message).toMatch(/duplicate key/);
    expect(result.current.uploading).toBe(false);
    expect(String(result.current.error)).toMatch(/duplicate key/);
  });

  it('reset clears error and progress', async () => {
    const { result } = renderHook(() => useFileUpload('test-bucket'));
    const badFile = makeFile({
      name: 'note.txt',
      type: 'text/plain',
      size: 1024,
    });

    await act(async () => {
      try {
        await result.current.upload(badFile, 'x/y.txt');
      } catch {
        /* expected */
      }
    });

    expect(result.current.error).not.toBeNull();

    act(() => {
      result.current.reset();
    });

    expect(result.current.error).toBeNull();
    expect(result.current.progress).toBe(0);
    expect(result.current.uploading).toBe(false);
  });
});
