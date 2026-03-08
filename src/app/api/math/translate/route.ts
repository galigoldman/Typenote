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
        { status: 400 },
      );
    }

    // TODO: Remove mock and restore AI call once API quota is resolved
    const latex = `\\frac{1}{2} \\times 5`;

    return NextResponse.json({ latex });
  } catch (error) {
    console.error('Math translation error:', error);
    return NextResponse.json(
      { error: 'Failed to translate math expression' },
      { status: 500 },
    );
  }
}
