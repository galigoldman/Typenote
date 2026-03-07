import { NextResponse } from 'next/server';
import { generateText } from 'ai';
import { google } from '@ai-sdk/google';

/**
 * Strips accidental LaTeX delimiters and markdown formatting
 * that the AI model might include in its response.
 */
export function sanitizeLatex(raw: string): string {
  let result = raw.trim();

  // Strip markdown code fences: ```latex ... ``` or ``` ... ```
  result = result.replace(/^```(?:latex|tex)?\n?([\s\S]*?)\n?```$/g, '$1');

  // Strip display math delimiters: $$ ... $$
  result = result.replace(/^\$\$([\s\S]*?)\$\$$/g, '$1');

  // Strip \[ ... \] delimiters
  result = result.replace(/^\\\[([\s\S]*?)\\\]$/g, '$1');

  // Strip \( ... \) delimiters
  result = result.replace(/^\\\(([\s\S]*?)\\\)$/g, '$1');

  // Strip inline math delimiters: $ ... $ (single)
  result = result.replace(/^\$([\s\S]*?)\$$/g, '$1');

  // Strip backticks: ` ... `
  result = result.replace(/^`([\s\S]*?)`$/g, '$1');

  return result.trim();
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { text } = body;

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return NextResponse.json(
        { error: 'Missing or empty "text" field' },
        { status: 400 }
      );
    }

    const { text: aiResponse } = await generateText({
      model: google('gemini-2.5-flash'),
      system:
        'You are a LaTeX converter. Convert the given natural language math expression into raw LaTeX code. ' +
        'Output ONLY the raw LaTeX expression. ' +
        'Do NOT wrap it in dollar signs, \\[\\], \\(\\), backticks, code fences, or any other delimiters. ' +
        'Do NOT include any explanation or markdown. ' +
        'Handle input in any language.',
      prompt: text.trim(),
    });

    const latex = sanitizeLatex(aiResponse);

    return NextResponse.json({ latex });
  } catch (error) {
    console.error('Math translation error:', error);
    return NextResponse.json(
      { error: 'Failed to translate math expression' },
      { status: 500 }
    );
  }
}
