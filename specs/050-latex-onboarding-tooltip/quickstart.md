# Quickstart: LaTeX Onboarding Tooltip

**Feature**: 050-latex-onboarding-tooltip

## Prerequisites

- Node.js 22+, pnpm installed
- Local Supabase running (`supabase start`)
- `.env.local` configured

## Development

```bash
# Switch to feature branch
git checkout 050-latex-onboarding-tooltip

# Install deps (if not already)
pnpm install

# Start dev server
pnpm dev
```

## Testing the Feature

### Manual Testing

1. Open any document in the editor
2. **First-time flow**: Clear localStorage key `typenote:latex-onboarding-dismissed` in DevTools → Application → Local Storage, then reload
3. The onboarding popover should appear automatically near the LaTeX (Sigma) icon
4. Click "Got it" — popover closes, key is written to localStorage
5. Reload — popover should NOT auto-appear
6. **On-demand flow**: Click the Sigma icon — popover appears without "Got it" button
7. Click outside — popover closes

### Automated Tests

```bash
# Unit tests
pnpm test

# E2E tests (requires local Supabase + dev server)
pnpm test:e2e

# All tests
pnpm test && pnpm test:integration && pnpm test:e2e
```

## Key Files

| File                                         | Purpose                            |
| -------------------------------------------- | ---------------------------------- |
| `src/components/editor/editor-toolbar.tsx`   | Modified — adds LaTeX icon button  |
| `src/components/editor/latex-onboarding.tsx` | New — popover component            |
| `src/hooks/use-local-dismissal.ts`           | New — localStorage read/write hook |
| `public/images/latex-before-after.svg`       | New — before/after illustration    |
| `e2e/latex-onboarding.spec.ts`               | New — E2E test file                |
