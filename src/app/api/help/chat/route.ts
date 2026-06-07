import { createHelpChatRoute } from 'daymo/next';
import { helpBundleBaseUrl, HELP_SUGGESTED_QUESTIONS } from '@/lib/help/config';

/**
 * One chat endpoint for BOTH help surfaces: the /help page's ask bar and the
 * in-app widget POST the same `{ message, history }` body here (the widget
 * adds a `widgetId` field, which the handler ignores).
 *
 * Daymo's route wraps the whole pipeline: fetch index.json (93 narration
 * chunks + Gemini embeddings) from Supabase Storage on cold start, embed the
 * question, retrieve the matching video moments, and answer with Gemini via
 * the Vercel AI SDK — same SDK + API key the rest of Typenote's AI uses.
 */
const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;

const handler = apiKey
  ? createHelpChatRoute({
      apiKey,
      baseUrl: helpBundleBaseUrl(),
      suggestedQuestions: HELP_SUGGESTED_QUESTIONS,
      rateLimitPerMinute: 20,
    })
  : null;

export async function POST(req: Request): Promise<Response> {
  // Graceful degradation: without a key (e.g. CI) the page and gallery still
  // work — only the ask bar reports the assistant as unavailable.
  if (!handler) {
    return new Response(JSON.stringify({ error: 'assistant unavailable' }), {
      status: 503,
      headers: { 'content-type': 'application/json' },
    });
  }
  return handler(req);
}
