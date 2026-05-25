import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

import { buildAiContext, type QuestionParams } from '@/lib/actions/ai-context';
import { checkAndIncrementUsage, recordTokenUsage } from '@/lib/ai/rate-limit';
import { createClient } from '@/lib/supabase/server';

const isDebugMode = process.env.AI_RATE_LIMIT_DEBUG === 'true';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      question,
      courseId,
      documentId,
      mode,
      courseName,
      documentContent,
      conversationHistory,
      conversationId,
      imageData,
    } = body;

    // Validate required fields
    if (!question || typeof question !== 'string' || !question.trim()) {
      return NextResponse.json(
        { error: 'question is required' },
        { status: 400 },
      );
    }

    if (courseId !== undefined && typeof courseId !== 'string') {
      return NextResponse.json(
        { error: 'courseId must be a string' },
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
      if (imageData.length > 5_300_000) {
        return NextResponse.json(
          { error: 'imageData exceeds maximum size (4MB)' },
          { status: 400 },
        );
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

    // --- Deep mode restriction ---
    // Only pro tier users can use deep mode (Gemini Pro).
    // Beta and free users are restricted to quick mode (Gemini Flash).
    if (mode === 'deep') {
      // Get user's tier from profiles
      const { data: profile } = await supabase
        .from('profiles')
        .select('subscription_tier')
        .eq('id', user.id)
        .single();

      const userTier = profile?.subscription_tier ?? 'free';

      if (userTier !== 'pro') {
        return NextResponse.json(
          {
            error: 'deep_mode_restricted',
            message: 'Deep mode is available on the Pro plan.',
            tier: userTier,
          },
          { status: 403 },
        );
      }
    }

    // Atomic check + increment. Fail-closed: if this throws, we reject the request.
    let rateLimit;
    try {
      rateLimit = await checkAndIncrementUsage(user.id, mode, 'chat');

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
    } else if (courseId) {
      // Create new conversation with title from first ~50 chars
      // (only when a course is linked — course_id is required in the DB)
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

    // --- Debug mode: return mock response without calling Gemini ---
    // Set AI_RATE_LIMIT_DEBUG=true to test rate limiting without API costs.
    // The rate limit counter still increments normally above.
    if (isDebugMode) {
      const debugResponse = `[DEBUG MODE] Mock response for: "${question.slice(0, 50)}..." (mode: ${mode}, tier: ${rateLimit.tier}, usage: ${rateLimit.currentCount}/${rateLimit.monthlyLimit})`;

      // Persist mock message if conversation is active
      if (activeConversationId) {
        await supabase.from('ai_messages').insert({
          conversation_id: activeConversationId,
          role: 'assistant',
          content: debugResponse,
          model: mode === 'deep' ? 'pro' : 'flash',
        });
      }

      const encoder = new TextEncoder();
      const debugStream = new ReadableStream({
        start(controller) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: 'sources', sources: [], model: mode === 'deep' ? 'pro' : 'flash', homeworkContextUsed: false })}\n\n`,
            ),
          );
          if (activeConversationId) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: 'conversation', conversationId: activeConversationId, messageId: userMessageId })}\n\n`,
              ),
            );
          }
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: 'text', text: debugResponse })}\n\n`,
            ),
          );
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`),
          );
          controller.close();
        },
      });

      return new Response(debugStream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
      });
    }

    const params: QuestionParams = {
      question: question.trim(),
      courseId,
      documentId: documentId || undefined,
      mode,
      courseName: courseName || undefined,
      documentContent: documentContent || undefined,
      // Use server-loaded history if available, otherwise fall back to client-sent history
      conversationHistory:
        serverHistory.length > 0
          ? serverHistory
          : conversationHistory || undefined,
      imageData: imageData || undefined,
    };

    // Build context (RAG search, prompt, etc.)
    const { systemPrompt, contents, modelName, sources, homeworkContextUsed } =
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
              `data: ${JSON.stringify({ type: 'sources', sources, model: modelLabel, homeworkContextUsed })}\n\n`,
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
          // Fire-and-forget token recording for admin observability
          recordTokenUsage(user.id, 'chat', 0, 0).catch(() => {});
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
