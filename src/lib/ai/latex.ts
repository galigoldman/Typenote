import { generateText } from 'ai';
import { getModel } from './provider';
import { LATEX_SYSTEM_PROMPT } from './prompts';

export async function convertToLatex(text: string): Promise<string> {
  const { text: latex } = await generateText({
    model: getModel(),
    system: LATEX_SYSTEM_PROMPT,
    prompt: text,
    temperature: 0,
  });

  return latex.trim();
}
