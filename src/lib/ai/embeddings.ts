import { GoogleGenAI } from '@google/genai';

const EMBEDDING_MODEL = 'gemini-embedding-2-preview';
const EMBEDDING_DIMENSIONS = 1536;

function getGenAI() {
  return new GoogleGenAI({
    apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? '',
  });
}

/**
 * Embed a PDF or PPTX file directly using Gemini Embedding 2 (multimodal).
 * Sends raw file bytes — no text extraction needed.
 * The model processes visual and text content of each page.
 * Max 6 pages per call.
 */
export async function embedFileSegment(
  buffer: Buffer,
  mimeType: string,
): Promise<number[]> {
  const genai = getGenAI();
  const base64Data = buffer.toString('base64');

  const response = await genai.models.embedContent({
    model: EMBEDDING_MODEL,
    contents: [
      {
        inlineData: {
          mimeType,
          data: base64Data,
        },
      },
    ],
    config: {
      outputDimensionality: EMBEDDING_DIMENSIONS,
    },
  });

  return response.embeddings?.[0]?.values ?? [];
}

/**
 * Embed a text string (for DOCX extracted text or search queries).
 */
export async function embedText(text: string): Promise<number[]> {
  const genai = getGenAI();

  const response = await genai.models.embedContent({
    model: EMBEDDING_MODEL,
    contents: text,
    config: {
      outputDimensionality: EMBEDDING_DIMENSIONS,
      taskType: 'RETRIEVAL_DOCUMENT',
    },
  });

  return response.embeddings?.[0]?.values ?? [];
}

/**
 * Embed a search query (uses RETRIEVAL_QUERY task type for asymmetric search).
 */
export async function embedQuery(text: string): Promise<number[]> {
  const genai = getGenAI();

  const response = await genai.models.embedContent({
    model: EMBEDDING_MODEL,
    contents: text,
    config: {
      outputDimensionality: EMBEDDING_DIMENSIONS,
      taskType: 'RETRIEVAL_QUERY',
    },
  });

  return response.embeddings?.[0]?.values ?? [];
}
