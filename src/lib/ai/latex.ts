import { generateText } from 'ai';
import { getModel } from './provider';
import { buildLatexPrompt } from './prompts';
import { estimateTokens } from './tokens';

export interface LatexResult {
  latex: string;
  inputTokens: number;
  outputTokens: number;
}

export async function convertToLatex(
  text: string,
  courseName?: string,
): Promise<LatexResult> {
  const system = buildLatexPrompt(courseName);
  const result = await generateText({
    model: getModel(),
    system,
    prompt: text,
    temperature: 0,
  });

  const latex = result.text.trim();
  // AI SDK usage field naming has varied across versions; read both, then
  // fall back to a char estimate so we never record zeros.
  const usage = result.usage as
    | {
        inputTokens?: number;
        promptTokens?: number;
        outputTokens?: number;
        completionTokens?: number;
      }
    | undefined;
  const inputTokens =
    usage?.inputTokens ??
    usage?.promptTokens ??
    estimateTokens(`${system}\n${text}`);
  const outputTokens =
    usage?.outputTokens ?? usage?.completionTokens ?? estimateTokens(latex);

  return { latex, inputTokens, outputTokens };
}
