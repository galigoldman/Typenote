import { NextResponse } from 'next/server';
import { convertToLatex } from '@/lib/ai/latex';
import { checkAndIncrementUsage, recordTokenUsage } from '@/lib/ai/rate-limit';
import { createClient } from '@/lib/supabase/server';

const isDebugMode = process.env.AI_RATE_LIMIT_DEBUG === 'true';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { text, courseName } = body;

    // Debug mode: return mock LaTeX without calling Gemini (skip auth + rate limit)
    if (isDebugMode) {
      return NextResponse.json({
        latex: '5 \\times \\frac{1}{2}',
      });
    }

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return NextResponse.json({ error: 'Text is required' }, { status: 400 });
    }

    if (text.length > 500) {
      return NextResponse.json(
        { error: 'Text must be 500 characters or less' },
        { status: 400 },
      );
    }

    // Validate optional courseName
    if (
      courseName !== undefined &&
      (typeof courseName !== 'string' || courseName.length > 200)
    ) {
      return NextResponse.json(
        { error: 'courseName must be a string of 200 characters or less' },
        { status: 400 },
      );
    }

    // Auth check
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Rate limit check — uses 'latex' query type for separate quota
    try {
      const rateLimit = await checkAndIncrementUsage(user.id, 'flash', 'latex');

      if (!rateLimit.isAllowed) {
        const now = new Date();
        const resetsAt = new Date(
          Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
        );

        return NextResponse.json(
          {
            error: 'Monthly LaTeX quota exceeded',
            quota: {
              used: rateLimit.currentCount,
              limit: rateLimit.monthlyLimit,
              tier: rateLimit.tier,
              resetsAt: resetsAt.toISOString(),
            },
          },
          { status: 429 },
        );
      }
    } catch {
      return NextResponse.json(
        { error: 'Rate limit check failed' },
        { status: 503 },
      );
    }

    const { latex, inputTokens, outputTokens } = await convertToLatex(
      text.trim(),
      courseName || undefined,
    );

    // Fire-and-forget token recording (latex always runs on Flash).
    recordTokenUsage(user.id, 'flash', inputTokens, outputTokens).catch(
      () => {},
    );

    return NextResponse.json({ latex });
  } catch (error) {
    console.error('LaTeX conversion error:', error);
    return NextResponse.json(
      { error: 'Failed to convert to LaTeX' },
      { status: 500 },
    );
  }
}
