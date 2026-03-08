import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/ai/latex', () => ({
  convertToLatex: vi.fn(),
}));

import { POST } from './route';
import { convertToLatex } from '@/lib/ai/latex';

function createRequest(body: unknown): Request {
  return new Request('http://localhost:3000/api/ai/latex', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/ai/latex', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return 200 with latex for valid input', async () => {
    vi.mocked(convertToLatex).mockResolvedValue('\\frac{1}{2} \\times 5');

    const res = await POST(createRequest({ text: 'one half times five' }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.latex).toBe('\\frac{1}{2} \\times 5');
  });

  it('should return 400 when text is missing', async () => {
    const res = await POST(createRequest({}));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe('Text is required');
  });

  it('should return 400 when text is empty', async () => {
    const res = await POST(createRequest({ text: '' }));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe('Text is required');
  });

  it('should return 400 when text exceeds 500 characters', async () => {
    const res = await POST(createRequest({ text: 'a'.repeat(501) }));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe('Text must be 500 characters or less');
  });

  it('should return 500 when conversion fails', async () => {
    vi.mocked(convertToLatex).mockRejectedValue(new Error('fail'));

    const res = await POST(createRequest({ text: 'test' }));
    const data = await res.json();

    expect(res.status).toBe(500);
    expect(data.error).toBe('Failed to convert to LaTeX');
  });
});
