import { after } from 'next/server';

/**
 * Runs `work` AFTER the HTTP response has been sent, without blocking it.
 *
 * Why this exists: AI indexing (embedding every chunk of a file) takes tens of
 * seconds and was being `await`ed inside the Moodle sync routes, so the user's
 * sync hung on it — even for files already stored/deduped. Embedding only needs
 * to happen ONCE per file and nobody is waiting on its result, so it belongs
 * after the response.
 *
 * We use Next's `after()` rather than a bare detached promise because on
 * serverless (Vercel) the function can freeze the moment it responds, dropping
 * any in-flight detached promise. `after()` keeps the runtime alive until the
 * work finishes. If `after()` isn't usable in the current context (e.g. a unit
 * test with no request scope) we fall back to a best-effort detached run.
 */
export function scheduleAfterResponse(work: () => Promise<void>): void {
  try {
    after(work);
  } catch {
    // No request scope available — best-effort detached execution.
    void work().catch(() => {});
  }
}
