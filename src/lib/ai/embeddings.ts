import { GoogleGenAI } from '@google/genai';
import type { PageText } from '@/lib/ai/extraction/pdf';
import { estimateTokens } from '@/lib/ai/tokens';

const EMBEDDING_MODEL = 'gemini-embedding-2-preview';
const EMBEDDING_DIMENSIONS = 1536;

function getGenAI() {
  return new GoogleGenAI({
    apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? '',
  });
}

export interface EmbedResult {
  values: number[];
  /** Estimated token count (Developer API returns none for embeddings). */
  tokens: number;
}

/**
 * Embed a text string for storage (document side of asymmetric retrieval).
 */
export async function embedText(text: string): Promise<EmbedResult> {
  const genai = getGenAI();

  const response = await genai.models.embedContent({
    model: EMBEDDING_MODEL,
    contents: text,
    config: {
      outputDimensionality: EMBEDDING_DIMENSIONS,
      taskType: 'RETRIEVAL_DOCUMENT',
    },
  });

  return {
    values: response.embeddings?.[0]?.values ?? [],
    tokens: estimateTokens(text),
  };
}

/**
 * Embed a search query (query side of asymmetric retrieval).
 */
export async function embedQuery(text: string): Promise<EmbedResult> {
  const genai = getGenAI();

  const response = await genai.models.embedContent({
    model: EMBEDDING_MODEL,
    contents: text,
    config: {
      outputDimensionality: EMBEDDING_DIMENSIONS,
      taskType: 'RETRIEVAL_QUERY',
    },
  });

  return {
    values: response.embeddings?.[0]?.values ?? [],
    tokens: estimateTokens(text),
  };
}

export interface PageChunk {
  text: string;
  chunkIndex: number;
  pageStart: number | null; // 0-indexed
  pageEnd: number | null; // 0-indexed
}

/** Target chunk size. ~400 tokens for Latin text; far under the 8192-token cap. */
const CHUNK_CHAR_BUDGET = 1600;
/** Chars carried over between consecutive chunks so a sentence split across a
 * boundary is still retrievable from both sides (~12.5% of the budget). */
const CHUNK_CHAR_OVERLAP = 200;

interface MathSpan {
  start: number;
  end: number; // [start, end) including delimiters
}

/** Locate `$...$` and `$$...$$` spans so we never split through one. */
function mathSpans(text: string): MathSpan[] {
  const spans: MathSpan[] = [];
  let i = 0;
  while (i < text.length) {
    if (text[i] === '$' && text[i - 1] !== '\\') {
      // Adjacent/odd delimiters (`$$$`, an escaped `\$$`) are vanishingly rare
      // in extracted PDF text; we resolve them conservatively — an unmatched
      // run becomes a single "unterminated" span and is kept whole, never split.
      const display = text[i + 1] === '$';
      const delimLen = display ? 2 : 1;
      let j = i + delimLen;
      let close = -1;
      while (j < text.length) {
        if (text[j] === '$' && text[j - 1] !== '\\') {
          if (!display || text[j + 1] === '$') {
            close = j;
            break;
          }
        }
        j++;
      }
      if (close === -1) {
        spans.push({ start: i, end: text.length }); // unterminated — keep whole
        break;
      }
      const end = close + delimLen;
      spans.push({ start: i, end });
      i = end;
    } else {
      i++;
    }
  }
  return spans;
}

function insideMath(spans: MathSpan[], pos: number): boolean {
  return spans.some((s) => pos > s.start && pos < s.end);
}

/** Largest clean boundary <= hardEnd that isn't inside a math span.
 * `chunkStart` is the start of the current chunk window — we never cut before
 * it (that would re-emit text and stall progress). */
function findSafeBoundary(
  text: string,
  spans: MathSpan[],
  chunkStart: number,
  hardEnd: number,
): number {
  for (const sep of ['\n\n', '\n', ' ']) {
    let pos = text.lastIndexOf(sep, hardEnd);
    while (pos > chunkStart) {
      const cut = pos + sep.length;
      if (!insideMath(spans, cut)) return cut;
      pos = text.lastIndexOf(sep, pos - 1);
    }
  }
  const span = spans.find((s) => hardEnd > s.start && hardEnd < s.end);
  return span ? span.end : hardEnd; // extend past an over-budget math span
}

/** Split one text into budgeted, math-safe pieces with overlap. */
function splitText(text: string): string[] {
  const t = text.trim();
  if (t.length <= CHUNK_CHAR_BUDGET) return t ? [t] : [];
  const spans = mathSpans(t);
  const out: string[] = [];
  let start = 0;
  while (start < t.length) {
    const hardEnd = Math.min(start + CHUNK_CHAR_BUDGET, t.length);
    const end =
      hardEnd >= t.length
        ? t.length
        : findSafeBoundary(t, spans, start, hardEnd);
    const piece = t.slice(start, end).trim();
    if (piece) out.push(piece);
    if (end >= t.length) break;
    let next = end - CHUNK_CHAR_OVERLAP;
    if (next <= start || insideMath(spans, next)) next = end; // progress + no mid-math start
    start = next;
  }
  return out;
}

/** PDF/PPTX: pack pages into budgeted chunks tagged with the 0-indexed page range. */
export function chunkPages(pages: PageText[]): PageChunk[] {
  const chunks: PageChunk[] = [];
  let idx = 0;
  let buf = '';
  let bufStart: number | null = null;
  let bufEnd: number | null = null;

  const flush = () => {
    const t = buf.trim();
    if (t) {
      chunks.push({
        text: t,
        chunkIndex: idx++,
        pageStart: bufStart,
        pageEnd: bufEnd,
      });
    }
    buf = '';
    bufStart = null;
    bufEnd = null;
  };

  for (const p of pages) {
    const page0 = p.page - 1; // store 0-indexed
    const text = (p.text ?? '').trim();
    if (!text) continue; // image-only / empty page: nothing to embed or quote

    if (text.length > CHUNK_CHAR_BUDGET) {
      flush();
      for (const part of splitText(text)) {
        chunks.push({
          text: part,
          chunkIndex: idx++,
          pageStart: page0,
          pageEnd: page0,
        });
      }
      continue;
    }

    // +2 accounts for the '\n\n' separator inserted between merged page texts.
    if (buf && buf.length + text.length + 2 > CHUNK_CHAR_BUDGET) flush();
    if (!buf) bufStart = page0;
    bufEnd = page0;
    buf = buf ? `${buf}\n\n${text}` : text;
  }
  flush();
  return chunks;
}

/** DOCX / page-less fallback: budgeted, math-safe chunks with null page tags. */
export function chunkFlatText(text: string): PageChunk[] {
  return splitText(text).map((t, i) => ({
    text: t,
    chunkIndex: i,
    pageStart: null,
    pageEnd: null,
  }));
}
