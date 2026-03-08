import { NextResponse } from 'next/server';
import { convertToLatex } from '@/lib/ai/latex';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { text } = body;

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return NextResponse.json({ error: 'Text is required' }, { status: 400 });
    }

    if (text.length > 500) {
      return NextResponse.json(
        { error: 'Text must be 500 characters or less' },
        { status: 400 },
      );
    }

    const latex = await convertToLatex(text.trim());

    return NextResponse.json({ latex });
  } catch (error) {
    console.error('LaTeX conversion error:', error);
    return NextResponse.json(
      { error: 'Failed to convert to LaTeX' },
      { status: 500 },
    );
  }
}
