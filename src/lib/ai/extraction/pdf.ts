import { GoogleGenAI } from '@google/genai';

function getGenAI() {
  return new GoogleGenAI({
    apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? '',
  });
}

/**
 * Extract text from a PDF using Gemini Flash (multimodal).
 * Preserves math notation as LaTeX and handles Hebrew text.
 */
export async function extractPdfText(buffer: Buffer): Promise<string> {
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
            text: 'Extract ALL text content from this PDF exactly as written. Preserve math notation using LaTeX (e.g. $x^2$). Output only the extracted text, no commentary.',
          },
        ],
      },
    ],
  });

  return result.text ?? '';
}
