import { NextResponse } from 'next/server';
import { generateText } from 'ai';
import { google } from '@ai-sdk/google';

const SYSTEM_PROMPT = `You are a math notation translator. Convert natural language math descriptions (in English or Hebrew) into raw LaTeX notation.

Rules:
- Output ONLY the raw LaTeX expression, nothing else
- Do NOT wrap in dollar signs ($) or display delimiters ($$)
- Do NOT include any explanation or commentary
- Use standard LaTeX math commands (\\frac, \\sqrt, \\int, \\sum, etc.)
- For simple expressions, use concise notation (e.g., "x squared" → "x^2")

Examples:
- "x squared plus 1" → "x^2 + 1"
- "the integral from 0 to infinity of e to the minus x dx" → "\\int_0^{\\infty} e^{-x} dx"
- "square root of a squared plus b squared" → "\\sqrt{a^2 + b^2}"
- "the sum from i equals 1 to n of x sub i" → "\\sum_{i=1}^{n} x_i"`;

function sanitizeLatex(raw: string): string {
  let result = raw.trim();
  // Strip accidental delimiters
  if (result.startsWith('$$') && result.endsWith('$$')) {
    result = result.slice(2, -2).trim();
  } else if (result.startsWith('$') && result.endsWith('$')) {
    result = result.slice(1, -1).trim();
  }
  // Strip markdown code fences
  if (result.startsWith('```') && result.endsWith('```')) {
    result = result.slice(3, -3).trim();
    // Remove optional language tag (e.g., ```latex)
    if (result.startsWith('latex')) {
      result = result.slice(5).trim();
    }
  }
  return result;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { naturalLanguage } = body;

    if (!naturalLanguage || typeof naturalLanguage !== 'string' || !naturalLanguage.trim()) {
      return NextResponse.json({ error: 'naturalLanguage is required' }, { status: 400 });
    }

    const { text } = await generateText({
      model: google('gemini-2.5-flash'),
      system: SYSTEM_PROMPT,
      prompt: naturalLanguage.trim(),
    });

    const latex = sanitizeLatex(text);

    return NextResponse.json({ latex });
  } catch (error) {
    console.error('Math translation error:', error);
    return NextResponse.json({ error: 'Failed to translate math expression' }, { status: 500 });
  }
}
