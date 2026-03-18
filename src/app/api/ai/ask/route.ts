import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

import { buildAiContext, type QuestionParams } from '@/lib/actions/ai-context';
import { checkAndIncrementUsage } from '@/lib/ai/rate-limit';
import { createClient } from '@/lib/supabase/server';

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
      conversationId,
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

    // --- Rate limit check (before any AI work) ---
    // Authenticate first, then atomically check + increment usage.
    // Why before buildAiContext? Because buildAiContext calls getAuthUserId()
    // internally, but we need the userId here for the rate limit RPC.
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Atomic check + increment. Fail-closed: if this throws, we reject the request.
    // Why fail-closed? The purpose of rate limiting is cost protection. A database
    // outage shouldn't become a cost spike.
    try {
      const rateLimit = await checkAndIncrementUsage(user.id, mode);

      if (!rateLimit.isAllowed) {
        // First day of next month
        const now = new Date();
        const resetsAt = new Date(
          Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
        );

        return NextResponse.json(
          {
            error: 'rate_limited',
            message: `You've used all ${rateLimit.monthlyLimit} of your monthly AI questions. Your quota resets on ${resetsAt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' })}.`,
            used: rateLimit.currentCount,
            limit: rateLimit.monthlyLimit,
            resetsAt: resetsAt.toISOString(),
          },
          { status: 429 },
        );
      }
    } catch (rateLimitError) {
      console.error('Rate limit check failed:', rateLimitError);
      return NextResponse.json(
        {
          error: 'service_unavailable',
          message:
            'AI service is temporarily unavailable. Please try again in a moment.',
        },
        { status: 503 },
      );
    }

    // --- Conversation persistence ---
    let activeConversationId = conversationId as string | undefined;
    let serverHistory: Array<{ role: string; content: string }> = [];

    // If continuing an existing conversation, load recent messages
    if (activeConversationId) {
      // Verify ownership
      const { data: conv } = await supabase
        .from('ai_conversations')
        .select('id')
        .eq('id', activeConversationId)
        .eq('user_id', user.id)
        .single();

      if (!conv) {
        return new Response(
          JSON.stringify({ error: 'Conversation not found' }),
          {
            status: 404,
            headers: { 'Content-Type': 'application/json' },
          },
        );
      }

      // Load last 20 messages as server-side history
      const { data: recentMsgs } = await supabase
        .from('ai_messages')
        .select('role, content')
        .eq('conversation_id', activeConversationId)
        .order('created_at', { ascending: false })
        .limit(20);

      if (recentMsgs) {
        serverHistory = recentMsgs
          .reverse()
          .map((m) => ({ role: m.role, content: m.content }));
      }
    } else {
      // Create new conversation with title from first ~50 chars
      const title = question.slice(0, 50);
      const { data: newConv, error: convError } = await supabase
        .from('ai_conversations')
        .insert({
          user_id: user.id,
          course_id: courseId,
          title,
        })
        .select()
        .single();

      if (convError || !newConv) {
        console.error('Failed to create conversation:', convError);
        // Non-fatal — continue without persistence
      } else {
        activeConversationId = newConv.id;
      }
    }

    // Persist user message
    let userMessageId: string | undefined;
    if (activeConversationId) {
      const { data: userMsg } = await supabase
        .from('ai_messages')
        .insert({
          conversation_id: activeConversationId,
          role: 'user',
          content: question,
        })
        .select('id')
        .single();
      userMessageId = userMsg?.id;

      // Bump conversation updated_at
      await supabase
        .from('ai_conversations')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', activeConversationId);
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
      // Use server-loaded history if available, otherwise fall back to client-sent history
      conversationHistory:
        serverHistory.length > 0
          ? serverHistory
          : (conversationHistory || undefined),
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
    let fullResponse = '';
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Send sources metadata first
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: 'sources', sources, model: modelLabel })}\n\n`,
            ),
          );

          // Send conversation metadata so the client can track the conversation
          if (activeConversationId) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: 'conversation', conversationId: activeConversationId, messageId: userMessageId })}\n\n`,
              ),
            );
          }

          for await (const chunk of streamResult) {
            const text = chunk.text ?? '';
            if (text) {
              fullResponse += text;
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

          // Persist assistant message
          if (activeConversationId && fullResponse) {
            await supabase.from('ai_messages').insert({
              conversation_id: activeConversationId,
              role: 'assistant',
              content: fullResponse,
              sources_json: sources || null,
              model: mode === 'deep' ? 'pro' : 'flash',
            });

            // Bump conversation updated_at
            await supabase
              .from('ai_conversations')
              .update({ updated_at: new Date().toISOString() })
              .eq('id', activeConversationId);
          }
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
