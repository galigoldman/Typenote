import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

import { buildAiContext, type QuestionParams } from '@/lib/actions/ai-context';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      question,
      courseId,
      weekId,
      documentId,
      mode,
      courseName,
      weekLabel,
      documentContent,
      conversationHistory,
      imageData,
    } = body;

    // Validate required fields
    if (!question || typeof question !== 'string' || !question.trim()) {
      return NextResponse.json(
        { error: 'question is required' },
        { status: 400 },
      );
    }

    if (!courseId || typeof courseId !== 'string') {
      return NextResponse.json(
        { error: 'courseId is required' },
        { status: 400 },
      );
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
        if (
          !msg.role ||
          !msg.content ||
          !['user', 'assistant'].includes(msg.role)
        ) {
          return NextResponse.json(
            {
              error:
                'Each conversationHistory entry must have role ("user"|"assistant") and content',
            },
            { status: 400 },
          );
        }
      }
    }

    // Validate imageData if provided
    if (imageData !== undefined) {
      if (typeof imageData !== 'string' || !imageData.trim()) {
        return NextResponse.json(
          { error: 'imageData must be a non-empty string' },
          { status: 400 },
        );
      }
      // Max ~4MB base64 ≈ 3MB image
      if (imageData.length > 5_300_000) {
        return NextResponse.json(
          { error: 'imageData exceeds maximum size (4MB)' },
          { status: 400 },
        );
      }
    }

    const params: QuestionParams = {
      question: question.trim(),
      courseId,
      weekId: weekId || undefined,
      documentId: documentId || undefined,
      mode,
      courseName: courseName || undefined,
      weekLabel: weekLabel || undefined,
      documentContent: documentContent || undefined,
      conversationHistory: conversationHistory || undefined,
      imageData: imageData || undefined,
    };

    // Build context (RAG search, prompt, etc.)
    const { systemPrompt, contents, modelName, sources } =
      await buildAiContext(params);

    // Stream the response
    const genai = new GoogleGenAI({
      apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? '',
    });

    const streamResult = await genai.models.generateContentStream({
      model: modelName,
      contents,
      config: { systemInstruction: systemPrompt },
    });

    const modelLabel = mode === 'deep' ? 'pro' : 'flash';

    // Create a streaming response using SSE-like format
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Send sources metadata first
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: 'sources', sources, model: modelLabel })}\n\n`,
            ),
          );

          for await (const chunk of streamResult) {
            const text = chunk.text ?? '';
            if (text) {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ type: 'text', text })}\n\n`,
                ),
              );
            }
          }

          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`),
          );
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Stream error';
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: 'error', error: message })}\n\n`,
            ),
          );
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
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
