# Quickstart: Fix iPad Google OAuth Sign-In

**Feature**: 048-fix-ipad-google-auth
**Date**: 2026-05-27

## Prerequisites

- Node.js 22+, pnpm
- Supabase CLI with `supabase start` running
- An iPad or iPad Simulator (Xcode) for testing Safari
- Google OAuth credentials configured (see `.env.local`)

## Local Development

```bash
# 1. Start local Supabase
supabase start

# 2. Start dev server
pnpm dev

# 3. Open in iPad Safari (or Safari simulator)
# Navigate to http://<your-local-ip>:3000/signup
```

## Key Files to Modify

| File                             | Change                                             |
| -------------------------------- | -------------------------------------------------- |
| `src/app/(auth)/signup/page.tsx` | Fix Google OAuth redirect for Safari compatibility |
| `src/app/(auth)/login/page.tsx`  | Same Safari-compatible redirect fix                |
| `src/app/auth/callback/route.ts` | Improve error handling for PKCE failures           |
| `src/lib/supabase/middleware.ts` | Verify OAuth error redirect handling               |

## Testing on iPad

1. **Real iPad**: Connect to same network, use `http://<mac-ip>:3000`
2. **Xcode Simulator**: Open Safari in iPad simulator, navigate to `http://localhost:3000`
3. **Safari Remote Debugging**: Enable in iPad Settings → Safari → Advanced → Web Inspector, then use Safari DevTools on Mac to debug

## Test Scenarios

1. Tap "Sign up with Google" → Google account picker appears
2. Select Google account → Redirected to dashboard with session
3. Sign out → Sign in with Google on login page → Same behavior
4. Cancel Google consent → Return to signup page without errors
5. Test on desktop Chrome to ensure no regression

## Running Tests

```bash
pnpm test          # Unit tests
pnpm test:integration  # Integration tests
pnpm test:e2e      # E2E browser tests
```
