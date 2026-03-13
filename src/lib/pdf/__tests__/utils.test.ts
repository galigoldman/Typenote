import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sanitizeFilename, triggerDownload } from '../utils';

describe('sanitizeFilename', () => {
  it('should remove unsafe characters', () => {
    expect(sanitizeFilename('my/doc:file*name')).toBe('mydocfilename');
  });

  it('should trim whitespace', () => {
    expect(sanitizeFilename('  hello  ')).toBe('hello');
  });

  it('should return "Untitled" for empty result', () => {
    expect(sanitizeFilename('///:::')).toBe('Untitled');
  });

  it('should return "Untitled" for empty string', () => {
    expect(sanitizeFilename('')).toBe('Untitled');
  });

  it('should preserve normal characters', () => {
    expect(sanitizeFilename('My Document 2024')).toBe('My Document 2024');
  });
});

describe('triggerDownload', () => {
  let mockAnchor: {
    href: string;
    download: string;
    click: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.restoreAllMocks();

    mockAnchor = {
      href: '',
      download: '',
      click: vi.fn(),
    };

    vi.spyOn(document, 'createElement').mockReturnValue(
      mockAnchor as unknown as HTMLElement,
    );
    vi.spyOn(document.body, 'appendChild').mockImplementation(
      (node) => node,
    );
    vi.spyOn(document.body, 'removeChild').mockImplementation(
      (node) => node,
    );
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  });

  it('should create anchor element with correct attributes', () => {
    const blob = new Blob(['test'], { type: 'application/pdf' });

    triggerDownload(blob, 'test.pdf');

    expect(document.createElement).toHaveBeenCalledWith('a');
    expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
    expect(mockAnchor.href).toBe('blob:mock-url');
    expect(mockAnchor.download).toBe('test.pdf');
  });

  it('should click and remove the anchor element', () => {
    const blob = new Blob(['test'], { type: 'application/pdf' });

    triggerDownload(blob, 'test.pdf');

    expect(document.body.appendChild).toHaveBeenCalledWith(mockAnchor);
    expect(mockAnchor.click).toHaveBeenCalledOnce();
    expect(document.body.removeChild).toHaveBeenCalledWith(mockAnchor);
  });

  it('should revoke object URL after download', () => {
    const blob = new Blob(['test'], { type: 'application/pdf' });

    triggerDownload(blob, 'test.pdf');

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });
});
