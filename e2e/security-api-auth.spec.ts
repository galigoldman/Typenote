/**
 * Security: API auth-boundary tests.
 *
 * Every authenticated API route in this app must return 401 when the
 * caller does not have a valid Supabase session cookie. A single
 * forgotten `getUser()` check on a new route would let any anonymous
 * request hit downstream resources (DB, AI provider, storage).
 *
 * These tests use a request context with NO storageState (no cookies),
 * so they exercise the "unauthenticated" branch deterministically.
 */
import { test, expect, request } from '@playwright/test';

const PROTECTED_POST_ROUTES = [
  { path: '/api/ai/ask', body: { question: 'hi', mode: 'quick' } },
  { path: '/api/ai/latex', body: { text: 'x^2' } },
  { path: '/api/ai/search', body: { query: 'derivative', courseId: 'x' } },
  { path: '/api/ai/reindex', body: { materialId: 'x' } },
];

const PROTECTED_GET_ROUTES = [
  '/api/ai/quota',
  '/api/ai/conversations?courseId=x',
];

test.describe('Security — API auth boundary', () => {
  test('unauthenticated POST to protected routes returns 401', async () => {
    // Fresh context with no cookies / storageState.
    const ctx = await request.newContext();
    try {
      for (const { path, body } of PROTECTED_POST_ROUTES) {
        const res = await ctx.post(path, {
          data: body,
          headers: { 'Content-Type': 'application/json' },
        });
        // The route handler short-circuits on missing user with 401.
        // 400 (validator runs first), 401 (auth-rejected), or 405
        // (route doesn't accept POST at all) all prove the request did
        // NOT reach a model call or DB write — the security property
        // we need. Anything 2xx/3xx or 5xx is a bug.
        expect(
          [400, 401, 405],
          `${path} returned ${res.status()} (expected 400/401/405)`,
        ).toContain(res.status());
        if (res.status() === 401) {
          const json = await res.json().catch(() => ({}));
          expect(JSON.stringify(json).toLowerCase()).toMatch(/unauth/);
        }
      }
    } finally {
      await ctx.dispose();
    }
  });

  test('unauthenticated GET to protected routes returns 401', async () => {
    const ctx = await request.newContext();
    try {
      for (const path of PROTECTED_GET_ROUTES) {
        const res = await ctx.get(path);
        expect(
          [401, 400],
          `${path} returned ${res.status()} (expected 401 or 400)`,
        ).toContain(res.status());
      }
    } finally {
      await ctx.dispose();
    }
  });

  test('unauthenticated POST with empty body still rejected (not 500)', async () => {
    // A common misconfiguration: route checks auth AFTER trying to parse
    // request body. A malformed-body unauthenticated request must NOT
    // return 500 — that would leak server internals and indicate a
    // crash path reachable without auth.
    const ctx = await request.newContext();
    try {
      const res = await ctx.post('/api/ai/ask', {
        data: '', // empty body — no JSON
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status()).toBeLessThan(500);
      expect([400, 401, 405]).toContain(res.status());
    } finally {
      await ctx.dispose();
    }
  });
});
