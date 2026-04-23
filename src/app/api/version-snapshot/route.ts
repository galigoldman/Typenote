import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { documentId } = body as { documentId?: string };

    if (!documentId) {
      return new NextResponse(null, { status: 400 });
    }

    const supabase = await createClient();

    // Fire-and-forget — beacon callers don't read responses
    await supabase.rpc('create_document_version', {
      p_document_id: documentId,
      p_trigger: 'close',
    });

    return new NextResponse(null, { status: 204 });
  } catch {
    // Beacon endpoint should never fail loudly
    return new NextResponse(null, { status: 204 });
  }
}
