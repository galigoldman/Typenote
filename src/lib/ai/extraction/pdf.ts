import { GoogleGenAI, Type } from '@google/genai';

function getGenAI() {
  return new GoogleGenAI({
    apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? '',
  });
}

export interface PageText {
  /** 1-indexed page number as returned by the model. */
  page: number;
  text: string;
}

/**
 * Extract text from a PDF/PPTX as structured per-page output using Gemini Flash
 * (multimodal). Faithful, text-only: preserves LaTeX and Hebrew; does NOT invent
 * figure descriptions (so quoted "evidence" stays verbatim). Returns pages sorted
 * by page number; returns [] if the response can't be parsed.
 */
export async function extractPdfPages(buffer: Buffer): Promise<PageText[]> {
  const genai = getGenAI();

  const result = await genai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [
      {
        role: 'user',
        parts: [
          {
            inlineData: {
              mimeType: 'application/pdf',
              data: buffer.toString('base64'),
            },
          },
          {
            text: 'Extract the text of EACH PAGE of this PDF exactly as written, in page order. Preserve math notation using LaTeX ($...$ for inline, $$...$$ for display). Preserve Hebrew exactly. Do NOT describe images or invent figure captions — output only text that is actually written on the page. Return one object per page with its 1-based page number.',
          },
        ],
      },
    ],
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            page: { type: Type.INTEGER },
            text: { type: Type.STRING },
          },
          required: ['page', 'text'],
        },
      },
    },
  });

  const raw = result.text ?? '[]';
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  return (parsed as PageText[])
    .filter(
      (p) =>
        p &&
        typeof p.page === 'number' &&
        Number.isFinite(p.page) &&
        p.page >= 1 &&
        typeof p.text === 'string',
    )
    .sort((a, b) => a.page - b.page);
}

