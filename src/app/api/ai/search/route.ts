import { NextResponse } from 'next/server';

import { searchContext } from '@/lib/actions/ai-context';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get('query');
    const courseId = searchParams.get('courseId');
    const weekId = searchParams.get('weekId');
    const maxResultsParam = searchParams.get('maxResults');

    if (!query || !query.trim()) {
      return NextResponse.json({ error: 'query is required' }, { status: 400 });
    }

    if (!courseId) {
      return NextResponse.json({ error: 'courseId is required' }, { status: 400 });
    }

    const maxResults = maxResultsParam ? parseInt(maxResultsParam, 10) : undefined;
    if (maxResultsParam && (isNaN(maxResults!) || maxResults! < 1)) {
      return NextResponse.json(
        { error: 'maxResults must be a positive integer' },
        { status: 400 },
      );
    }

    const results = await searchContext({
      query: query.trim(),
      courseId,
      weekId: weekId || undefined,
      maxResults,
    });

    return NextResponse.json({ results });
  } catch (error) {
    console.error('AI search error:', error);

    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return NextResponse.json(
      { error: 'Failed to search context' },
      { status: 500 },
    );
  }
}
