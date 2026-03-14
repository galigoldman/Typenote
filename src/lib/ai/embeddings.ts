import { GoogleGenAI } from '@google/genai';

const EMBEDDING_MODEL = 'gemini-embedding-2-preview';
const EMBEDDING_DIMENSIONS = 1536;

function getGenAI() {
  return new GoogleGenAI({
    apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? '',
  });
}

/**
 * Embed a PDF or PPTX page segment directly via multimodal Embedding 2.
 * Sends raw file bytes — no text extraction needed.
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
        parts: [
          {
            inlineData: {
              mimeType,
              data: base64Data,
            },
          },
        ],
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
