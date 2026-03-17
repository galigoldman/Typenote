import { GoogleGenAI } from '@google/genai';

const EMBEDDING_MODEL = 'gemini-embedding-2-preview';
const EMBEDDING_DIMENSIONS = 1536;

/** Max chars per text chunk for embedding. ~6000 tokens with headroom. */
const MAX_CHARS_PER_CHUNK = 25000;

function getGenAI() {
  return new GoogleGenAI({
    apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? '',
  });
}

export interface TextChunk {
  text: string;
  chunkIndex: number;
}

/**
 * Split text into chunks if it exceeds MAX_CHARS_PER_CHUNK.
 * Splits at paragraph boundaries (\n\n) to preserve context.
 */
export function chunkText(text: string): TextChunk[] {
  if (text.length <= MAX_CHARS_PER_CHUNK) {
    return [{ text, chunkIndex: 0 }];
  }

  const chunks: TextChunk[] = [];
  let remaining = text;
  let index = 0;

  while (remaining.length > 0) {
    if (remaining.length <= MAX_CHARS_PER_CHUNK) {
      chunks.push({ text: remaining, chunkIndex: index });
      break;
    }

    // Find a paragraph break near the limit
    let splitAt = remaining.lastIndexOf('\n\n', MAX_CHARS_PER_CHUNK);
    if (splitAt < MAX_CHARS_PER_CHUNK / 2) {
      // No good paragraph break — split at newline
      splitAt = remaining.lastIndexOf('\n', MAX_CHARS_PER_CHUNK);
    }
    if (splitAt < MAX_CHARS_PER_CHUNK / 2) {
      // No good break at all — hard split
      splitAt = MAX_CHARS_PER_CHUNK;
    }

    chunks.push({ text: remaining.slice(0, splitAt), chunkIndex: index });
    remaining = remaining.slice(splitAt).trimStart();
    index++;
  }

  return chunks;
}

/**
 * Embed a text string for storage (document side of asymmetric retrieval).
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
 * Embed a search query (query side of asymmetric retrieval).
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
