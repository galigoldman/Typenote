import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const DOC_ID = '0dbcbe48-6f96-474a-9f15-31601eb6d013';
const GOOD_CONTENT = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        {
          type: 'inlineMath',
          attrs: {
            latex: '\\frac{1}{2} \\times 5',
            naturalLanguage: 'one half times five',
          },
        },
      ],
    },
  ],
};

/**
 * Temporary test endpoint: directly saves math content to a document.
 * DELETE THIS after confirming the save works.
 *
 * GET /api/test-math-save?action=save  — saves good math content
 * GET /api/test-math-save?action=read  — reads current content
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const action = url.searchParams.get('action') || 'read';

  const supabase = await createClient();

  if (action === 'save') {
    const { data, error } = await supabase
      .from('documents')
      .update({ content: GOOD_CONTENT })
      .eq('id', DOC_ID)
      .select('updated_at, content')
      .single();

    if (error) {
      return new Response(`<html><body><h1>Error</h1><pre>${error.message}</pre></body></html>`, {
        headers: { 'Content-Type': 'text/html' },
      });
    }
    return new Response(
      `<html><body><h1>Saved!</h1><pre>${JSON.stringify(data.content, null, 2)}</pre><p>updated_at: ${data.updated_at}</p></body></html>`,
      { headers: { 'Content-Type': 'text/html' } },
    );
  }

  // Read
  const { data, error } = await supabase
    .from('documents')
    .select('content, updated_at')
    .eq('id', DOC_ID)
    .single();

  if (error) {
    return new Response(`<html><body><h1>Error</h1><pre>${error.message}</pre></body></html>`, {
      headers: { 'Content-Type': 'text/html' },
    });
  }
  return new Response(
    `<html><body><h1>Current DB Content</h1><pre>${JSON.stringify(data.content, null, 2)}</pre><p>updated_at: ${data.updated_at}</p></body></html>`,
    { headers: { 'Content-Type': 'text/html' } },
  );
}

export async function POST(request: Request) {
  const { documentId, content } = await request.json();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('documents')
    .update({ content })
    .eq('id', documentId)
    .select('updated_at, content')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ saved: data.content, updated_at: data.updated_at });
}
