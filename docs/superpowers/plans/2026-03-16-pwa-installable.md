# PWA Installable App Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Typenote installable as a PWA on iOS and Android with standalone mode, branded icons, splash screen, and a minimal offline fallback page.

**Architecture:** Use `@ducanh2912/next-pwa` plugin to auto-generate and register a service worker. Use Next.js 16 built-in `manifest.ts` App Router convention for the web app manifest. Update root layout metadata for PWA/iOS meta tags. Add an offline fallback page via the App Router `~offline` convention.

**Tech Stack:** Next.js 16 (App Router), `@ducanh2912/next-pwa`, Workbox (auto-managed by plugin)

---

## File Structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `src/app/manifest.ts` | Web app manifest (name, icons, display, colors) |
| Create | `src/app/(offline)/~offline/page.tsx` | Branded offline fallback page |
| Create | `public/icons/icon-192x192.png` | Standard PWA icon (192px) |
| Create | `public/icons/icon-512x512.png` | Standard PWA icon (512px) |
| Create | `public/icons/icon-maskable-512x512.png` | Maskable icon for Android adaptive shapes |
| Create | `public/icons/apple-touch-icon.png` | Apple touch icon (180x180) |
| Create | `src/app/(offline)/~offline/__tests__/page.test.tsx` | Tests for offline page |
| Create | `src/lib/pwa/__tests__/manifest.test.ts` | Tests for manifest output |
| Create | `src/app/__tests__/layout-metadata.test.ts` | Tests for PWA metadata in layout |
| Modify | `src/app/layout.tsx` | Add PWA metadata, apple-web-app tags, viewport theme color |
| Modify | `next.config.ts` | Wrap config with `withPWA` from `@ducanh2912/next-pwa` |
| Modify | `src/middleware.ts` | Exclude `~offline` route from auth middleware |
| Modify | `.gitignore` | Ignore generated service worker files in `public/` |

---

## Chunk 1: Foundation — Package, Config, Manifest

### Task 1: Install `@ducanh2912/next-pwa` and configure Next.js

**Files:**
- Modify: `next.config.ts`
- Modify: `package.json` (via pnpm)
- Modify: `.gitignore`

- [ ] **Step 1: Install the package**

```bash
pnpm add @ducanh2912/next-pwa
```

- [ ] **Step 2: Update `next.config.ts` to wrap with PWA plugin**

Modify `next.config.ts` to wrap the existing config with the PWA plugin. Add the `withPWAInit` import and wrap the `nextConfig` export:

```typescript
import type { NextConfig } from 'next';
import withPWAInit from '@ducanh2912/next-pwa';

const withPWA = withPWAInit({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
});

const nextConfig: NextConfig = {
  /* config options here */
};

export default withPWA(nextConfig);
```

**Important:** Preserve any existing config options inside `nextConfig`. Only add the `withPWAInit` import and wrap the export. If other branches have added config options (e.g., `images`, `experimental`), keep them inside `nextConfig`.

**Why `disable` in dev?** The service worker caches aggressively, which breaks hot-reload during development. We only want it active in production builds.

**Why no `fallbacks` config?** The `@ducanh2912/next-pwa` plugin auto-detects the `app/~offline/page.tsx` convention in App Router and uses it as the offline fallback. No explicit `fallbacks` config is needed.

- [ ] **Step 3: Add generated service worker files to `.gitignore`**

The plugin generates `sw.js` and `workbox-*.js` files in `public/` at build time. These should not be committed.

Append to `.gitignore`:

```
# PWA service worker (generated at build time by next-pwa)
public/sw.js
public/sw.js.map
public/workbox-*.js
public/workbox-*.js.map
public/swe-worker-*.js
```

- [ ] **Step 4: Verify the build still works**

```bash
pnpm build
```

Expected: Build succeeds. You may see warnings about missing manifest — that's fine, we add it next.

- [ ] **Step 5: Clean up generated files and commit**

```bash
rm -f public/sw.js public/sw.js.map public/workbox-*.js public/workbox-*.js.map public/swe-worker-*.js
git add next.config.ts .gitignore package.json pnpm-lock.yaml
git commit -m "feat: add @ducanh2912/next-pwa plugin with offline fallback config"
```

---

### Task 2: Create the web app manifest

**Files:**
- Create: `src/app/manifest.ts`
- Create: `src/lib/pwa/__tests__/manifest.test.ts`

- [ ] **Step 1: Write the failing test for manifest output**

Create `src/lib/pwa/__tests__/manifest.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import manifest from '@/app/manifest';

describe('PWA manifest', () => {
  const m = manifest();

  it('returns correct app name and description', () => {
    expect(m.name).toBe('Typenote');
    expect(m.short_name).toBe('Typenote');
    expect(m.description).toBe('Smart notes for STEM students');
  });

  it('sets standalone display mode', () => {
    expect(m.display).toBe('standalone');
  });

  it('sets start_url to dashboard', () => {
    expect(m.start_url).toBe('/dashboard');
  });

  it('includes required icon sizes', () => {
    const sizes = m.icons?.map((icon) => icon.sizes);
    expect(sizes).toContain('192x192');
    expect(sizes).toContain('512x512');
  });

  it('includes a maskable icon', () => {
    const maskable = m.icons?.find((icon) => icon.purpose === 'maskable');
    expect(maskable).toBeDefined();
    expect(maskable?.sizes).toBe('512x512');
  });

  it('defines theme and background colors', () => {
    expect(m.theme_color).toBeDefined();
    expect(m.background_color).toBeDefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm test src/lib/pwa/__tests__/manifest.test.ts
```

Expected: FAIL — `src/app/manifest.ts` does not exist yet.

- [ ] **Step 3: Create the manifest file**

Create `src/app/manifest.ts`:

```typescript
import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Typenote',
    short_name: 'Typenote',
    description: 'Smart notes for STEM students',
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#0a0a0a',
    icons: [
      {
        src: '/icons/icon-192x192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icons/icon-512x512.png',
        sizes: '512x512',
        type: 'image/png',
      },
      {
        src: '/icons/icon-maskable-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
```

**Why `start_url: '/dashboard'`?** Per spec FR-007 — the app opens to the main view. Auth middleware will redirect to `/login` if unauthenticated.

**Why `theme_color: '#0a0a0a'`?** This is close to the app's `--foreground` color in light mode (oklch(0.145 0 0) ≈ #0a0a0a), giving a dark status bar that matches the app's design language.

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm test src/lib/pwa/__tests__/manifest.test.ts
```

Expected: All 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/manifest.ts src/lib/pwa/__tests__/manifest.test.ts
git commit -m "feat: add web app manifest with icon and display config"
```

---

### Task 3: Update root layout with PWA metadata

**Files:**
- Modify: `src/app/layout.tsx`
- Create: `src/app/__tests__/layout-metadata.test.ts`

- [ ] **Step 1: Write the failing test for layout metadata**

Create `src/app/__tests__/layout-metadata.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { metadata, viewport } from '../layout';

describe('Root layout PWA metadata', () => {
  it('sets applicationName to Typenote', () => {
    expect(metadata.applicationName).toBe('Typenote');
  });

  it('enables Apple Web App with standalone capability', () => {
    expect(metadata.appleWebApp).toEqual(
      expect.objectContaining({
        capable: true,
        title: 'Typenote',
      })
    );
  });

  it('includes apple-touch-icon in icons', () => {
    const icons = metadata.icons as { apple: string };
    expect(icons.apple).toBe('/icons/apple-touch-icon.png');
  });

  it('sets theme color in viewport', () => {
    expect(viewport?.themeColor).toBeDefined();
  });

  it('disables telephone format detection', () => {
    expect(metadata.formatDetection).toEqual(
      expect.objectContaining({ telephone: false })
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test src/app/__tests__/layout-metadata.test.ts
```

Expected: FAIL — `viewport` is `undefined` (not yet exported), causing a TypeError on `viewport?.themeColor`, and `metadata` does not have `applicationName`, `appleWebApp`, etc.

- [ ] **Step 3: Update the metadata and viewport exports in `layout.tsx`**

Modify the existing `metadata` export and add a `viewport` export. The `manifest.ts` file is auto-detected by Next.js 16 — no explicit `manifest` field needed in metadata.

```typescript
import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Typenote',
  description: 'Smart notes for STEM students',
  applicationName: 'Typenote',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Typenote',
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: '/favicon.ico',
    apple: '/icons/apple-touch-icon.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#0a0a0a',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster />
      </body>
    </html>
  );
}
```

**Why no `manifest` field?** Next.js 16 auto-detects `src/app/manifest.ts` and generates the `<link rel="manifest">` tag automatically. No explicit reference needed.

**Why `appleWebApp.capable: true`?** This generates the `<meta name="apple-mobile-web-app-capable" content="yes">` tag that tells iOS Safari to launch in standalone mode.

**Why `appleWebApp.statusBarStyle: 'default'`?** Uses the default dark-text-on-light-background status bar. Other options are `'black'` and `'black-translucent'`.

**Why `formatDetection.telephone: false`?** Prevents iOS from auto-linking phone numbers in content, which can cause unexpected behavior in a note-taking app.

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm test src/app/__tests__/layout-metadata.test.ts
```

Expected: All 5 tests PASS.

- [ ] **Step 5: Verify the build works with new metadata**

```bash
pnpm build
```

Expected: Build succeeds without errors.

- [ ] **Step 6: Clean up generated SW files and commit**

```bash
rm -f public/sw.js public/sw.js.map public/workbox-*.js public/workbox-*.js.map public/swe-worker-*.js
git add src/app/layout.tsx src/app/__tests__/layout-metadata.test.ts
git commit -m "feat: add PWA metadata and iOS web app tags to root layout"
```

---

## Chunk 2: Offline Fallback, Middleware Fix, and Icon Placeholders

### Task 4: Exclude `~offline` route from auth middleware

**Files:**
- Modify: `src/middleware.ts`

The auth middleware intercepts all routes and runs Supabase session checks. When the PWA is offline, the service worker serves `/~offline` — but the middleware would try to call Supabase (which fails without network), causing a redirect loop or error instead of showing the offline page.

- [ ] **Step 1: Update the middleware matcher to exclude `~offline`**

In `src/middleware.ts`, add `~offline` to the exclusion pattern in the matcher regex:

Change:
```typescript
'/((?!_next/static|_next/image|favicon.ico|test/|supabase/|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ttf|woff|woff2)$).*)',
```

To:
```typescript
'/((?!_next/static|_next/image|favicon.ico|~offline|test/|supabase/|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ttf|woff|woff2)$).*)',
```

- [ ] **Step 2: Commit**

```bash
git add src/middleware.ts
git commit -m "fix: exclude ~offline route from auth middleware for PWA fallback"
```

---

### Task 5: Create the offline fallback page

**Files:**
- Create: `src/app/(offline)/~offline/page.tsx`
- Create: `src/app/(offline)/~offline/__tests__/page.test.tsx`

- [ ] **Step 1: Write the failing test for the offline page**

Create `src/app/(offline)/~offline/__tests__/page.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import OfflinePage from '../page';

describe('Offline fallback page', () => {
  it('renders a heading indicating offline status', () => {
    render(<OfflinePage />);
    expect(
      screen.getByRole('heading', { name: /offline/i })
    ).toBeInTheDocument();
  });

  it('renders a message asking the user to check their connection', () => {
    render(<OfflinePage />);
    expect(screen.getByText(/check your internet connection/i)).toBeInTheDocument();
  });

  it('renders a retry button', () => {
    render(<OfflinePage />);
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test "src/app/(offline)/~offline/__tests__/page.test.tsx"
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create the offline fallback page**

Create `src/app/(offline)/~offline/page.tsx`:

```tsx
'use client';

export default function OfflinePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="text-6xl">📡</div>
      <h1 className="text-2xl font-bold">You're Offline</h1>
      <p className="text-muted-foreground max-w-md">
        Please check your internet connection and try again. Your notes are
        safe — they'll be available once you're back online.
      </p>
      <button
        onClick={() => window.location.reload()}
        className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-6 py-2 text-sm font-medium transition-colors"
      >
        Try Again
      </button>
    </div>
  );
}
```

**Why `'use client'`?** The `window.location.reload()` call requires client-side JavaScript. This page needs to work as a static fallback served by the service worker.

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm test "src/app/(offline)/~offline/__tests__/page.test.tsx"
```

Expected: All 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(offline)/~offline/page.tsx" "src/app/(offline)/~offline/__tests__/page.test.tsx"
git commit -m "feat: add branded offline fallback page"
```

---

### Task 6: Add placeholder icon files

**Files:**
- Create: `public/icons/icon-192x192.png`
- Create: `public/icons/icon-512x512.png`
- Create: `public/icons/icon-maskable-512x512.png`
- Create: `public/icons/apple-touch-icon.png`

The user will provide the actual logo later. For now, we create minimal placeholder PNGs so the manifest is valid and the build works.

- [ ] **Step 1: Create the icons directory and placeholder files**

We'll generate minimal valid 1x1 placeholder PNGs using pure Node.js (no external dependencies). These are temporary — the user will replace them with real icons from their logo.

```bash
mkdir -p public/icons
node --input-type=commonjs -e "
const fs = require('fs');

// Minimal valid PNG: 1x1 dark pixel. Browsers will scale this as a placeholder.
// Real icons will be provided by the user from their logo asset.
const PNG_HEADER = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG signature
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, // 1x1
  0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde, // 8-bit RGB
  0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41, 0x54, // IDAT chunk
  0x08, 0xd7, 0x63, 0x60, 0x60, 0x60, 0x00, 0x00,
  0x00, 0x04, 0x00, 0x01, 0x27, 0x34, 0x27, 0x0a,
  0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, // IEND chunk
  0xae, 0x42, 0x60, 0x82,
]);

const files = [
  'public/icons/icon-192x192.png',
  'public/icons/icon-512x512.png',
  'public/icons/icon-maskable-512x512.png',
  'public/icons/apple-touch-icon.png',
];

files.forEach(f => {
  fs.writeFileSync(f, PNG_HEADER);
  console.log('Created placeholder: ' + f);
});
"
```

**Note:** These are minimal 1x1 pixel placeholders to make the manifest valid. The user will replace them with properly sized icons generated from their Typenote logo.

- [ ] **Step 2: Verify icons exist and are valid PNGs**

```bash
file public/icons/*.png
```

Expected: Each file is identified as `PNG image data` with correct dimensions.

- [ ] **Step 3: Commit**

```bash
git add public/icons/icon-192x192.png public/icons/icon-512x512.png public/icons/icon-maskable-512x512.png public/icons/apple-touch-icon.png
git commit -m "feat: add placeholder PWA icons (to be replaced with real logo)"
```

---

## Chunk 3: Verification and Full Test Suite

### Task 7: Run full test suite and verify build

**Files:** None (verification only)

- [ ] **Step 1: Run the full test suite**

```bash
pnpm test
```

Expected: All tests pass, including the new manifest and offline page tests.

- [ ] **Step 2: Run linting**

```bash
pnpm lint
```

Expected: No new lint errors.

- [ ] **Step 3: Run format check**

```bash
pnpm format:check
```

Expected: All files formatted correctly. If not, run `pnpm format` and commit.

- [ ] **Step 4: Production build and verify manifest**

```bash
pnpm build
```

Expected: Build succeeds. The plugin generates `public/sw.js` and `public/workbox-*.js`.

- [ ] **Step 5: Verify the generated manifest is accessible**

After building, check that Next.js generated the manifest route:

```bash
ls .next/server/app/manifest.webmanifest*
```

Expected: The manifest route handler file exists.

- [ ] **Step 6: Clean up generated SW files and commit any format fixes**

```bash
rm -f public/sw.js public/sw.js.map public/workbox-*.js public/workbox-*.js.map public/swe-worker-*.js
```

If there were formatting fixes, stage only the affected files:

```bash
pnpm format
git add src/app/manifest.ts src/app/layout.tsx "src/app/(offline)/~offline/page.tsx" next.config.ts src/middleware.ts
git commit -m "style: fix formatting"
```

---

### Task 8: Manual verification checklist (for when deployed)

This task is not automated — it's a checklist to run after deploying to a staging/production environment with HTTPS.

- [ ] **Step 1: Lighthouse PWA audit**

Open Chrome DevTools → Lighthouse → check "Progressive Web App" → Run audit.

Expected: Passes installability checks.

- [ ] **Step 2: Test Android install**

On Chrome for Android, visit the deployed URL. Use menu → "Install app" or wait for the install banner.

Expected: App installs with correct icon and name. Launches in standalone mode.

- [ ] **Step 3: Test iOS install**

On Safari for iOS/iPadOS, visit the deployed URL. Tap Share → "Add to Home Screen."

Expected: App appears on home screen with correct icon. Launches in standalone mode (no Safari chrome).

- [ ] **Step 4: Test offline fallback**

Install the PWA, then enable airplane mode and tap the app icon.

Expected: The branded "You're Offline" page appears (not a browser error).

- [ ] **Step 5: Test auth redirect**

Clear the PWA's site data (or use a fresh device), then tap the app icon.

Expected: Redirects to `/login`. After logging in, navigates to `/dashboard`.
