import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './route';

vi.mock('ai', () => ({
  generateText: vi.fn(),
}));

vi.mock('@ai-sdk/google', () => ({
  google: vi.fn(() => 'mock-model'),
}));

import { generateText } from 'ai';

const mockedGenerateText = vi.mocked(generateText);

function createRequest(body: unknown): Request {
  return new Request('http://localhost/api/math/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/math/translate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 for empty input', async () => {
    const res = await POST(createRequest({ naturalLanguage: '' }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('naturalLanguage is required');
  });

  it('returns 400 for missing naturalLanguage', async () => {
    const res = await POST(createRequest({}));
    expect(res.status).toBe(400);
  });

  it('returns 400 for whitespace-only input', async () => {
    const res = await POST(createRequest({ naturalLanguage: '   ' }));
    expect(res.status).toBe(400);
  });

  it('translates natural language to LaTeX', async () => {
    mockedGenerateText.mockResolvedValue({
      text: 'x^2 + 1',
    } as Awaited<ReturnType<typeof generateText>>);

    const res = await POST(createRequest({ naturalLanguage: 'x squared plus 1' }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.latex).toBe('x^2 + 1');
  });

  it('strips dollar sign delimiters from response', async () => {
    mockedGenerateText.mockResolvedValue({
      text: '$x^2 + 1$',
    } as Awaited<ReturnType<typeof generateText>>);

    const res = await POST(createRequest({ naturalLanguage: 'x squared plus 1' }));
    const data = await res.json();
    expect(data.latex).toBe('x^2 + 1');
  });

  it('strips double dollar sign delimiters from response', async () => {
    mockedGenerateText.mockResolvedValue({
      text: '$$\\frac{1}{2}$$',
    } as Awaited<ReturnType<typeof generateText>>);

    const res = await POST(createRequest({ naturalLanguage: 'one half' }));
    const data = await res.json();
    expect(data.latex).toBe('\\frac{1}{2}');
  });

  it('strips markdown code fences from response', async () => {
    mockedGenerateText.mockResolvedValue({
      text: '```latex\nx^2\n```',
    } as Awaited<ReturnType<typeof generateText>>);

    const res = await POST(createRequest({ naturalLanguage: 'x squared' }));
    const data = await res.json();
    expect(data.latex).toBe('x^2');
  });

  it('returns 500 on API error', async () => {
    mockedGenerateText.mockRejectedValue(new Error('API error'));

    const res = await POST(createRequest({ naturalLanguage: 'x squared' }));
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe('Failed to translate math expression');
  });
});
