import { generateText } from 'ai';
import { getModel } from './provider';
import { buildLatexPrompt } from './prompts';

export async function convertToLatex(
  text: string,
  courseName?: string,
): Promise<string> {
  const { text: latex } = await generateText({
    model: getModel(),
    system: buildLatexPrompt(courseName),
    prompt: text,
    temperature: 0,
  });

  return latex.trim();
}
