/**
 * Per-model AI token prices, in USD per 1,000,000 tokens.
 *
 * Prices are ENV-OVERRIDABLE so cost-per-token can be switched without a code
 * deploy (mirrors the AI_LIMIT_* rate-limit override pattern). Defaults are
 * approximate published Gemini prices and are safe to adjust.
 *
 * Tokens are the primary, accurate metric. The dollar figure is a derived,
 * switchable estimate and is labeled as such in the UI.
 */

export interface ModelPrice {
  input: number; // USD per 1M input tokens
  output: number; // USD per 1M output tokens
}

function envPrice(key: string, fallback: number): number {
  const raw = process.env[key];
  if (raw !== undefined) {
    const n = Number(raw);
    if (!Number.isNaN(n) && n >= 0) return n;
  }
  return fallback;
}

export function getModelPrices(): Record<string, ModelPrice> {
  return {
    flash: {
      input: envPrice('AI_PRICE_FLASH_INPUT', 0.3),
      output: envPrice('AI_PRICE_FLASH_OUTPUT', 2.5),
    },
    pro: {
      input: envPrice('AI_PRICE_PRO_INPUT', 1.25),
      output: envPrice('AI_PRICE_PRO_OUTPUT', 10.0),
    },
    embedding: {
      input: envPrice('AI_PRICE_EMBEDDING', 0.15),
      output: 0,
    },
  };
}

export function estimateCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const price = getModelPrices()[model];
  if (!price) return 0;
  return (
    (inputTokens / 1_000_000) * price.input +
    (outputTokens / 1_000_000) * price.output
  );
}
