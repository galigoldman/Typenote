/**
 * Rough token estimate from text length. The Gemini Developer API does not
 * return token counts for embeddings, and generation usage can be absent, so
 * this is the fallback. ~4 characters per token is the standard heuristic for
 * Latin-script text. Estimates are accepted — tokens are the metric we report;
 * the dollar figure derived from them is labeled an estimate.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return Math.ceil(trimmed.length / 4);
}
