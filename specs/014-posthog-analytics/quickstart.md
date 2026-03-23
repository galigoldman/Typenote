# Quickstart: PostHog Analytics Integration

**Feature**: 014-posthog-analytics
**Date**: 2026-03-23

## Prerequisites

1. A PostHog Cloud account (free tier) at https://app.posthog.com
2. A PostHog project created with the project API key (`phc_...`)
3. Local Typenote dev environment running (`pnpm dev`)

## Setup Steps

### 1. Install the package

```bash
pnpm add @posthog/next
```

### 2. Add environment variables

Add to `.env.local`:

```env
NEXT_PUBLIC_POSTHOG_KEY=phc_your_project_api_key
NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
```

### 3. Verify the integration

1. Start the dev server: `pnpm dev`
2. Open the app in your browser
3. Navigate between pages, click buttons, create a document
4. Go to PostHog dashboard → Live Events — you should see `$pageview` and `$autocapture` events
5. Go to Session Recordings — you should see your session appear within a few minutes
6. Check the browser console — no PostHog-related errors should appear

### 4. Test ad-blocker resilience

1. Enable an ad blocker (e.g., uBlock Origin)
2. Reload the app
3. Verify all features work normally — no console errors, no broken UI
4. PostHog events will not be captured (expected behavior)

### 5. Test error tracking

1. Open browser DevTools console
2. Navigate to any page
3. In the console, type: `throw new Error('test error')`
4. Go to PostHog dashboard → Error Tracking — the error should appear

## Key Files

| File                             | Purpose                                      |
| -------------------------------- | -------------------------------------------- |
| `src/app/layout.tsx`             | PostHogProvider wraps the app                |
| `src/middleware.ts`              | PostHog middleware (proxy + identity cookie) |
| `src/lib/analytics/events.ts`    | Custom event definitions + `trackEvent()`    |
| `src/lib/analytics/identify.tsx` | User identification component                |
| `.env.local.example`             | Environment variable template                |

## Running Tests

```bash
pnpm test                   # Unit tests (includes PostHog integration tests)
```
