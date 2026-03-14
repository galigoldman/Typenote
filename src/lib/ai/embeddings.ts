import { PDFDocument } from 'pdf-lib';
import { GoogleGenAI } from '@google/genai';

const EMBEDDING_MODEL = 'gemini-embedding-2-preview';
const EMBEDDING_DIMENSIONS = 1536;
const PAGES_PER_SEGMENT = 6;

function getGenAI() {
  return new GoogleGenAI({
    apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? '',
  });
}

/**
 * Split a PDF into chunks of up to PAGES_PER_SEGMENT pages.
 * Returns an array of { buffer, pageStart, pageEnd } for each chunk.
 */
async function splitPdf(
  buffer: Buffer,
): Promise<Array<{ buffer: Buffer; pageStart: number; pageEnd: number }>> {
  const srcDoc = await PDFDocument.load(buffer);
  const totalPages = srcDoc.getPageCount();

  if (totalPages <= PAGES_PER_SEGMENT) {
    return [{ buffer, pageStart: 1, pageEnd: totalPages }];
  }

  const chunks: Array<{ buffer: Buffer; pageStart: number; pageEnd: number }> = [];

  for (let start = 0; start < totalPages; start += PAGES_PER_SEGMENT) {
    const end = Math.min(start + PAGES_PER_SEGMENT, totalPages);
    const newDoc = await PDFDocument.create();
    const pages = await newDoc.copyPages(
      srcDoc,
      Array.from({ length: end - start }, (_, i) => start + i),
    );
    for (const page of pages) {
      newDoc.addPage(page);
    }
    const chunkBytes = await newDoc.save();
    chunks.push({
      buffer: Buffer.from(chunkBytes),
      pageStart: start + 1,
      pageEnd: end,
    });
  }

  return chunks;
}

/**
 * Embed a single PDF chunk directly using Gemini Embedding 2 (multimodal).
 * Max 6 pages per call.
 */
async function embedChunk(
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

export interface FileSegmentResult {
  embedding: number[];
  pageStart: number;
  pageEnd: number;
}

/**
 * Embed a PDF file by splitting into 6-page chunks and embedding each.
 * Returns one embedding per chunk with page range info.
 */
export async function embedFileSegments(
  buffer: Buffer,
  mimeType: string,
): Promise<FileSegmentResult[]> {
  if (mimeType !== 'application/pdf') {
    // Non-PDF: embed as single segment
    const embedding = await embedChunk(buffer, mimeType);
    return embedding.length
      ? [{ embedding, pageStart: 1, pageEnd: 1 }]
      : [];
  }

  const chunks = await splitPdf(buffer);
  const results: FileSegmentResult[] = [];

  for (const chunk of chunks) {
    const embedding = await embedChunk(chunk.buffer, mimeType);
    if (embedding.length) {
      results.push({
        embedding,
        pageStart: chunk.pageStart,
        pageEnd: chunk.pageEnd,
      });
    }
  }

  return results;
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
