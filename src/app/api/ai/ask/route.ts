import { NextResponse } from 'next/server';

import { askQuestion } from '@/lib/actions/ai-context';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { question, courseId, weekId, documentId, mode, conversationHistory } = body;

    // Validate required fields
    if (!question || typeof question !== 'string' || !question.trim()) {
      return NextResponse.json({ error: 'question is required' }, { status: 400 });
    }

    if (!courseId || typeof courseId !== 'string') {
      return NextResponse.json({ error: 'courseId is required' }, { status: 400 });
    }

    if (!mode || (mode !== 'quick' && mode !== 'deep')) {
      return NextResponse.json(
        { error: 'mode is required and must be "quick" or "deep"' },
        { status: 400 },
      );
    }

    // Validate conversationHistory shape if provided
    if (conversationHistory !== undefined) {
      if (!Array.isArray(conversationHistory)) {
        return NextResponse.json(
          { error: 'conversationHistory must be an array' },
          { status: 400 },
        );
      }

      for (const msg of conversationHistory) {
        if (!msg.role || !msg.content || !['user', 'assistant'].includes(msg.role)) {
          return NextResponse.json(
            { error: 'Each conversationHistory entry must have role ("user"|"assistant") and content' },
            { status: 400 },
          );
        }
      }
    }

    const result = await askQuestion({
      question: question.trim(),
      courseId,
      weekId: weekId || undefined,
      documentId: documentId || undefined,
      mode,
      conversationHistory: conversationHistory || undefined,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('AI ask error:', error);

    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return NextResponse.json(
      { error: 'Failed to process question' },
      { status: 500 },
    );
  }
}
