import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock 'ai' module
vi.mock('ai', () => ({
  generateText: vi.fn(),
}));

// Mock '@ai-sdk/google' module
vi.mock('@ai-sdk/google', () => ({
  google: vi.fn(() => 'mocked-model'),
}));

import { POST } from './route';
import { generateText } from 'ai';

const mockedGenerateText = vi.mocked(generateText);

function createRequest(body?: unknown): Request {
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

  it('returns latex for valid input', async () => {
    mockedGenerateText.mockResolvedValue({
      text: 'x^2 + 1',
    } as Awaited<ReturnType<typeof generateText>>);

    const req = createRequest({ text: 'x squared plus one' });
    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.latex).toBe('x^2 + 1');
    expect(mockedGenerateText).toHaveBeenCalledOnce();
  });

  it('returns 400 when text is missing', async () => {
    const req = createRequest({});
    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBeDefined();
  });

  it('returns 400 when text is empty string', async () => {
    const req = createRequest({ text: '' });
    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBeDefined();
  });

  it('returns 500 when AI fails', async () => {
    mockedGenerateText.mockRejectedValue(new Error('AI service unavailable'));

    const req = createRequest({ text: 'x squared plus one' });
    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(500);
    expect(data.error).toBeDefined();
  });

  it('strips $$ delimiters from AI response', async () => {
    mockedGenerateText.mockResolvedValue({
      text: '$$x^2 + 1$$',
    } as Awaited<ReturnType<typeof generateText>>);

    const req = createRequest({ text: 'x squared plus one' });
    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.latex).toBe('x^2 + 1');
  });

  it('strips single $ delimiters from AI response', async () => {
    mockedGenerateText.mockResolvedValue({
      text: '$x^2 + 1$',
    } as Awaited<ReturnType<typeof generateText>>);

    const req = createRequest({ text: 'x squared plus one' });
    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.latex).toBe('x^2 + 1');
  });

  it('strips \\[ \\] delimiters from AI response', async () => {
    mockedGenerateText.mockResolvedValue({
      text: '\\[x^2 + 1\\]',
    } as Awaited<ReturnType<typeof generateText>>);

    const req = createRequest({ text: 'x squared plus one' });
    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.latex).toBe('x^2 + 1');
  });

  it('strips \\( \\) delimiters from AI response', async () => {
    mockedGenerateText.mockResolvedValue({
      text: '\\(x^2 + 1\\)',
    } as Awaited<ReturnType<typeof generateText>>);

    const req = createRequest({ text: 'x squared plus one' });
    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.latex).toBe('x^2 + 1');
  });

  it('strips markdown code fences from AI response', async () => {
    mockedGenerateText.mockResolvedValue({
      text: '```latex\nx^2 + 1\n```',
    } as Awaited<ReturnType<typeof generateText>>);

    const req = createRequest({ text: 'x squared plus one' });
    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.latex).toBe('x^2 + 1');
  });

  it('strips backtick-wrapped responses', async () => {
    mockedGenerateText.mockResolvedValue({
      text: '`x^2 + 1`',
    } as Awaited<ReturnType<typeof generateText>>);

    const req = createRequest({ text: 'x squared plus one' });
    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.latex).toBe('x^2 + 1');
  });
});
