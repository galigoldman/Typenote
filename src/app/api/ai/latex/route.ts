import { NextResponse } from 'next/server';
import { convertToLatex } from '@/lib/ai/latex';
import { checkAndIncrementUsage } from '@/lib/ai/rate-limit';
import { createClient } from '@/lib/supabase/server';

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

    // Auth check
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Rate limit check
    try {
      const rateLimit = await checkAndIncrementUsage(user.id, 'quick');

      if (!rateLimit.isAllowed) {
        const now = new Date();
        const resetsAt = new Date(
          Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
        );

        return NextResponse.json(
          {
            error: 'Monthly AI quota exceeded',
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
