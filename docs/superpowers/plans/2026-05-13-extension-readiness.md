# Extension Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Moodle Chrome extension installable, detectable, and gated so its UI appears only on desktop Chromium browsers — without uploading to the Chrome Web Store yet.

**Architecture:** Three new units split by responsibility — a `useExtensionPlatform` hook for "is this device Chromium desktop?", an `<ExtensionGate>` wrapper that short-circuits rendering on unsupported platforms, and an upgraded `useMoodleExtension` state machine with a 2 s detection timeout and version handshake. The extension manifest tightens `host_permissions` to `optional_host_permissions` so future CWS review will pass, with a runtime per-domain permission request invoked the moment the user saves a Moodle URL.

**Tech Stack:** TypeScript 5, React 19, Next.js 16 (App Router), Tailwind 4 (`pointer-fine:` variant), Vitest + Testing Library, Playwright, Chrome Manifest V3.

**Spec:** [`docs/superpowers/specs/2026-05-13-extension-readiness-design.md`](../specs/2026-05-13-extension-readiness-design.md)

**Branch:** `feat/extension-readiness` (already created off latest `dev` at `08c1225`; spec already committed as `a8d1011`).

---

## Task 1: Bootstrap — env example + CLAUDE.md entry

Add the missing env variable to the example file so any developer cloning the repo knows about it, and append the standard "Active Technologies" line documenting this spec.

**Files:**

- Modify: `.env.local.example`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add `NEXT_PUBLIC_EXTENSION_ID` to `.env.local.example`**

Open `.env.local.example` and add at the end (after the PostHog block):

```
# Moodle Chrome Extension
# Set this to the unpacked extension ID shown in chrome://extensions after loading
# the unpacked extension from `extension/`. In production this will be the stable
# Chrome Web Store ID. The web app uses it to talk to the extension via
# chrome.runtime.sendMessage(EXTENSION_ID, ...).
# Leaving this blank is fine — the Moodle UI will simply render as "not installed".
NEXT_PUBLIC_EXTENSION_ID=
```

- [ ] **Step 2: Append the spec to CLAUDE.md "Active Technologies"**

Open `CLAUDE.md`, find the "Active Technologies" header, and insert this entry directly under it (above the existing `041-ui-redesign` line):

```markdown
- TypeScript 5 / Node.js 22+ + Next.js 16 (App Router), React 19, Tailwind 4 (`pointer-fine:` variant), Chrome Manifest V3, Vitest, Playwright (2026-05-13-extension-readiness)
- N/A — manifest tightening + client-side gating; no schema changes (2026-05-13-extension-readiness)
```

- [ ] **Step 3: Commit**

```bash
git add .env.local.example CLAUDE.md
git commit -m "chore: document NEXT_PUBLIC_EXTENSION_ID + extension-readiness in CLAUDE.md"
```

---

## Task 2: Tighten extension manifest + bump version

Move `<all_urls>` from required to optional host permissions, bump the manifest version, and bump the package.json version. After this, every Moodle domain the user connects must be granted at runtime via `chrome.permissions.request()`.

**Files:**

- Modify: `extension/manifest.json`
- Modify: `extension/package.json`

- [ ] **Step 1: Rewrite `extension/manifest.json`**

Replace the entire file with:

```json
{
  "manifest_version": 3,
  "name": "Typenote Moodle Sync",
  "version": "0.2.0",
  "description": "Import course materials from Moodle into Typenote",
  "permissions": ["storage", "scripting", "cookies", "tabs", "activeTab"],
  "optional_host_permissions": ["<all_urls>"],
  "background": {
    "service_worker": "dist/service-worker.js"
  },
  "externally_connectable": {
    "matches": ["http://localhost:3000/*", "https://*.typenote.app/*"]
  },
  "web_accessible_resources": [
    {
      "resources": ["dist/moodle-scraper.js"],
      "matches": ["https://*/*", "http://*/*"]
    }
  ]
}
```

The only changes from the current file: `"host_permissions": ["<all_urls>"]` becomes `"optional_host_permissions": ["<all_urls>"]`, and version `0.1.0` → `0.2.0`.

- [ ] **Step 2: Bump version in `extension/package.json`**

Edit `extension/package.json` and change `"version": "0.1.0"` to `"version": "0.2.0"`. No other changes.

- [ ] **Step 3: Verify the extension still typechecks and builds**

Run:

```bash
pnpm --filter typenote-moodle-extension typecheck
pnpm --filter typenote-moodle-extension build
```

Both should exit 0. `extension/dist/service-worker.js` and `extension/dist/moodle-scraper.js` should exist.

- [ ] **Step 4: Commit**

```bash
git add extension/manifest.json extension/package.json
git commit -m "feat(extension): move <all_urls> to optional_host_permissions; bump to 0.2.0"
```

---

## Task 3: `useExtensionPlatform` hook + tests

Pure feature detection: is this device a Chromium desktop browser? Uses `useSyncExternalStore` so it's SSR-safe and reacts when the user plugs in or unplugs a mouse (changes `pointer:fine`).

**Files:**

- Create: `src/hooks/use-extension-platform.ts`
- Create: `src/hooks/use-extension-platform.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/hooks/use-extension-platform.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const originalMatchMedia = globalThis.window?.matchMedia;
const originalChrome = (globalThis as Record<string, unknown>).chrome;

function setPointerFine(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query === '(pointer: fine)' ? matches : false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
    onchange: null,
  }));
}

function setChromeRuntime(present: boolean) {
  if (present) {
    (globalThis as Record<string, unknown>).chrome = {
      runtime: { sendMessage: vi.fn() },
    };
  } else {
    delete (globalThis as Record<string, unknown>).chrome;
  }
}

beforeEach(() => {
  setPointerFine(true);
  setChromeRuntime(true);
});

afterEach(() => {
  if (originalMatchMedia) window.matchMedia = originalMatchMedia;
  if (originalChrome) {
    (globalThis as Record<string, unknown>).chrome = originalChrome;
  } else {
    delete (globalThis as Record<string, unknown>).chrome;
  }
});

const { useExtensionPlatform } = await import('./use-extension-platform');

describe('useExtensionPlatform', () => {
  it('returns true on Chromium desktop (pointer-fine + chrome.runtime)', () => {
    const { result } = renderHook(() => useExtensionPlatform());
    expect(result.current.isSupportedPlatform).toBe(true);
  });

  it('returns false on touch-primary devices (iPad/mobile)', () => {
    setPointerFine(false);
    const { result } = renderHook(() => useExtensionPlatform());
    expect(result.current.isSupportedPlatform).toBe(false);
  });

  it('returns false on non-Chromium desktop (no chrome.runtime)', () => {
    setChromeRuntime(false);
    const { result } = renderHook(() => useExtensionPlatform());
    expect(result.current.isSupportedPlatform).toBe(false);
  });

  it('returns false when chrome exists but sendMessage is missing', () => {
    (globalThis as Record<string, unknown>).chrome = { runtime: {} };
    const { result } = renderHook(() => useExtensionPlatform());
    expect(result.current.isSupportedPlatform).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run:

```bash
pnpm test src/hooks/use-extension-platform.test.ts
```

Expected: all 4 tests fail with module-resolution error (`Cannot find module './use-extension-platform'`).

- [ ] **Step 3: Create `src/hooks/use-extension-platform.ts`**

```ts
'use client';

import { useSyncExternalStore } from 'react';

interface ExtensionPlatform {
  isSupportedPlatform: boolean;
}

function getSnapshot(): boolean {
  if (typeof window === 'undefined') return false;
  const pointerFine = window.matchMedia?.('(pointer: fine)').matches ?? false;
  const chromeRuntime = (window as unknown as { chrome?: typeof chrome }).chrome
    ?.runtime;
  const hasChromeRuntime = typeof chromeRuntime?.sendMessage === 'function';
  return pointerFine && hasChromeRuntime;
}

function subscribe(callback: () => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const mql = window.matchMedia('(pointer: fine)');
  mql.addEventListener('change', callback);
  return () => mql.removeEventListener('change', callback);
}

/**
 * Returns whether the current device can host the Typenote Moodle extension.
 * True only on Chromium-family desktop browsers with a fine pointer (mouse/trackpad).
 * SSR-safe: returns false on the server, hydrates to the real value on the client.
 */
export function useExtensionPlatform(): ExtensionPlatform {
  const isSupportedPlatform = useSyncExternalStore(
    subscribe,
    getSnapshot,
    () => false,
  );
  return { isSupportedPlatform };
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run:

```bash
pnpm test src/hooks/use-extension-platform.test.ts
```

Expected: all 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/use-extension-platform.ts src/hooks/use-extension-platform.test.ts
git commit -m "feat: add useExtensionPlatform hook for Chromium-desktop detection"
```

---

## Task 4: `<MoodleCardSkeleton>` placeholder component

A pulsing card placeholder that renders while the extension PING is in flight. Replaces the current "Checking for Typenote extension..." text — quieter, no layout shift.

**Files:**

- Create: `src/components/dashboard/moodle-card-skeleton.tsx`
- Create: `src/components/dashboard/moodle-card-skeleton.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/dashboard/moodle-card-skeleton.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MoodleCardSkeleton } from './moodle-card-skeleton';

describe('MoodleCardSkeleton', () => {
  it('renders a non-empty placeholder element', () => {
    const { container } = render(<MoodleCardSkeleton />);
    expect(container.firstChild).not.toBeNull();
    expect(container.textContent).toBe('');
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run:

```bash
pnpm test src/components/dashboard/moodle-card-skeleton.test.tsx
```

Expected: fails with module-resolution error.

- [ ] **Step 3: Create `src/components/dashboard/moodle-card-skeleton.tsx`**

```tsx
import { Card, CardContent, CardHeader } from '@/components/ui/card';

/**
 * Placeholder card rendered while the extension PING is in flight (≤2 s).
 * Empty text content — the visual interest comes entirely from animated pulse blocks.
 */
export function MoodleCardSkeleton() {
  return (
    <Card aria-busy="true" aria-label="Loading Moodle integration">
      <CardHeader>
        <div className="h-4 w-40 animate-pulse rounded bg-muted" />
        <div className="mt-2 h-3 w-64 animate-pulse rounded bg-muted" />
      </CardHeader>
      <CardContent>
        <div className="h-8 w-28 animate-pulse rounded bg-muted" />
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Run the test and confirm it passes**

```bash
pnpm test src/components/dashboard/moodle-card-skeleton.test.tsx
```

Expected: passes.

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/moodle-card-skeleton.tsx src/components/dashboard/moodle-card-skeleton.test.tsx
git commit -m "feat: add MoodleCardSkeleton placeholder for extension-detection state"
```

---

## Task 5: `<ExtensionGate>` wrapper component

Renders `children` only when the platform supports the extension. Returns `null` on touch and non-Chromium so no Moodle DOM exists at all in those environments.

**Files:**

- Create: `src/components/dashboard/extension-gate.tsx`
- Create: `src/components/dashboard/extension-gate.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/dashboard/extension-gate.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const originalMatchMedia = globalThis.window?.matchMedia;
const originalChrome = (globalThis as Record<string, unknown>).chrome;

function setSupported(supported: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query === '(pointer: fine)' ? supported : false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
    onchange: null,
  }));
  if (supported) {
    (globalThis as Record<string, unknown>).chrome = {
      runtime: { sendMessage: vi.fn() },
    };
  } else {
    delete (globalThis as Record<string, unknown>).chrome;
  }
}

afterEach(() => {
  if (originalMatchMedia) window.matchMedia = originalMatchMedia;
  if (originalChrome) {
    (globalThis as Record<string, unknown>).chrome = originalChrome;
  } else {
    delete (globalThis as Record<string, unknown>).chrome;
  }
});

const { ExtensionGate } = await import('./extension-gate');

describe('ExtensionGate', () => {
  it('renders children on a supported platform', () => {
    setSupported(true);
    render(
      <ExtensionGate>
        <p>moodle ui</p>
      </ExtensionGate>,
    );
    expect(screen.getByText('moodle ui')).toBeInTheDocument();
  });

  it('renders nothing on an unsupported platform', () => {
    setSupported(false);
    const { container } = render(
      <ExtensionGate>
        <p>moodle ui</p>
      </ExtensionGate>,
    );
    expect(container.firstChild).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

```bash
pnpm test src/components/dashboard/extension-gate.test.tsx
```

Expected: fails with module-resolution error.

- [ ] **Step 3: Create `src/components/dashboard/extension-gate.tsx`**

```tsx
'use client';

import type { ReactNode } from 'react';
import { useExtensionPlatform } from '@/hooks/use-extension-platform';

interface ExtensionGateProps {
  children: ReactNode;
}

/**
 * Renders `children` only on Chromium-family desktop browsers.
 * Silent — no fallback UI on touch/non-Chromium devices.
 *
 * @see useExtensionPlatform for the detection logic.
 */
export function ExtensionGate({ children }: ExtensionGateProps) {
  const { isSupportedPlatform } = useExtensionPlatform();
  if (!isSupportedPlatform) return null;
  return <>{children}</>;
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

```bash
pnpm test src/components/dashboard/extension-gate.test.tsx
```

Expected: both tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/extension-gate.tsx src/components/dashboard/extension-gate.test.tsx
git commit -m "feat: add ExtensionGate wrapper for Chromium-desktop-only UI"
```

---

## Task 6: Refactor `useMoodleExtension` to state machine + timeout + version handshake

Convert the boolean `isInstalled`/`isChecking` to a discriminated-union `state`. Add a 2 s timeout on PING. Compare the response version against `EXPECTED_EXTENSION_VERSION = '0.2.0'`. Emit a dev-only warning when `NEXT_PUBLIC_EXTENSION_ID` is missing. **Keep the legacy `isInstalled` / `isChecking` booleans as derived values** so existing consumers don't break in this commit — they'll migrate to `state` in later tasks.

**Files:**

- Modify: `src/hooks/use-moodle-extension.ts`
- Modify: `src/hooks/use-moodle-extension.test.ts`

- [ ] **Step 1: Add new failing tests for state machine, timeout, version handshake, and dev warning**

Append the following to `src/hooks/use-moodle-extension.test.ts` (inside the existing `describe('useMoodleExtension', () => { ... })` block, before the closing brace):

```ts
it('exposes state.status="installed" with version when ping succeeds at the expected version', async () => {
  mockSendMessage.mockImplementation(
    (_id: string, _msg: unknown, callback: (...args: unknown[]) => void) => {
      callback({ success: true, data: { version: '0.2.0' } });
    },
  );

  const { result } = renderHook(() => useMoodleExtension());
  await waitFor(() => expect(result.current.state.status).not.toBe('checking'));

  expect(result.current.state).toEqual({
    status: 'installed',
    version: '0.2.0',
  });
  expect(result.current.isInstalled).toBe(true);
});

it('exposes state.status="version-mismatch" when ping returns a different version', async () => {
  mockSendMessage.mockImplementation(
    (_id: string, _msg: unknown, callback: (...args: unknown[]) => void) => {
      callback({ success: true, data: { version: '0.1.0' } });
    },
  );

  const { result } = renderHook(() => useMoodleExtension());
  await waitFor(() => expect(result.current.state.status).not.toBe('checking'));

  expect(result.current.state).toEqual({
    status: 'version-mismatch',
    installedVersion: '0.1.0',
  });
  expect(result.current.isInstalled).toBe(false);
});

it('falls back to "not-installed" when the PING response is malformed', async () => {
  mockSendMessage.mockImplementation(
    (_id: string, _msg: unknown, callback: (...args: unknown[]) => void) => {
      callback({ success: true, data: {} });
    },
  );

  const { result } = renderHook(() => useMoodleExtension());
  await waitFor(() => expect(result.current.state.status).not.toBe('checking'));

  expect(result.current.state.status).toBe('not-installed');
});

it('times out to "not-installed" after 2 seconds when the extension never responds', async () => {
  vi.useFakeTimers();
  mockSendMessage.mockImplementation(() => {
    // never call the callback — simulates a hung extension
  });

  const { result } = renderHook(() => useMoodleExtension());

  // Advance fake timers past the 2s timeout
  await vi.advanceTimersByTimeAsync(2_000);
  await waitFor(() => expect(result.current.state.status).not.toBe('checking'));

  expect(result.current.state.status).toBe('not-installed');
  vi.useRealTimers();
});
```

Also add this test outside the `describe` block (it tests an env-var-absent path that requires a fresh module import):

```ts
describe('useMoodleExtension when NEXT_PUBLIC_EXTENSION_ID is unset', () => {
  it('treats the extension as not-installed and warns in dev', async () => {
    vi.stubEnv('NEXT_PUBLIC_EXTENSION_ID', '');
    const warnSpy = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);
    vi.resetModules();

    const { useMoodleExtension: freshHook } =
      await import('./use-moodle-extension');
    const { result } = renderHook(() => freshHook());

    await waitFor(() =>
      expect(result.current.state.status).not.toBe('checking'),
    );

    expect(result.current.state.status).toBe('not-installed');
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('NEXT_PUBLIC_EXTENSION_ID'),
    );

    warnSpy.mockRestore();
    vi.stubEnv('NEXT_PUBLIC_EXTENSION_ID', 'test-extension-id');
  });
});
```

- [ ] **Step 2: Run the tests and confirm the new ones fail**

```bash
pnpm test src/hooks/use-moodle-extension.test.ts
```

Expected: the 5 new tests fail (older ones still pass). Failure messages mention `state` is undefined or `version-mismatch` not produced.

- [ ] **Step 3: Rewrite `src/hooks/use-moodle-extension.ts`**

Replace the whole file with:

```ts
'use client';

import { useState, useEffect, useCallback } from 'react';

const EXTENSION_ID = process.env.NEXT_PUBLIC_EXTENSION_ID ?? '';
export const EXPECTED_EXTENSION_VERSION = '0.2.0';
const PING_TIMEOUT_MS = 2_000;

export type ExtensionState =
  | { status: 'checking' }
  | { status: 'installed'; version: string }
  | { status: 'not-installed' }
  | { status: 'version-mismatch'; installedVersion: string };

async function sendExtensionMessage<T>(message: unknown): Promise<T | null> {
  if (!EXTENSION_ID) return null;
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(EXTENSION_ID, message, (response: unknown) => {
        if (chrome.runtime.lastError) {
          resolve(null);
          return;
        }
        resolve(response as T);
      });
    } catch {
      resolve(null);
    }
  });
}

function withTimeout<T>(
  promise: Promise<T | null>,
  ms: number,
): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    promise.then((value) => {
      clearTimeout(timer);
      resolve(value);
    });
  });
}

export function useMoodleExtension() {
  const [state, setState] = useState<ExtensionState>({ status: 'checking' });

  useEffect(() => {
    let cancelled = false;

    async function checkExtension() {
      if (!EXTENSION_ID) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn(
            '[Typenote] NEXT_PUBLIC_EXTENSION_ID is not set. The Moodle extension will appear as not-installed. See .env.local.example.',
          );
        }
        if (!cancelled) setState({ status: 'not-installed' });
        return;
      }

      const response = await withTimeout(
        sendExtensionMessage<{ success: boolean; data?: { version?: string } }>(
          { type: 'PING' },
        ),
        PING_TIMEOUT_MS,
      );

      if (cancelled) return;

      const version = response?.data?.version;
      if (!response?.success || !version) {
        setState({ status: 'not-installed' });
        return;
      }
      if (version !== EXPECTED_EXTENSION_VERSION) {
        setState({ status: 'version-mismatch', installedVersion: version });
        return;
      }
      setState({ status: 'installed', version });
    }

    void checkExtension();
    return () => {
      cancelled = true;
    };
  }, []);

  const ping = useCallback(async () => {
    const response = await sendExtensionMessage<{
      success: boolean;
      data: { version: string };
    }>({ type: 'PING' });
    return response?.success ? response.data : null;
  }, []);

  const checkPermission = useCallback(async (moodleUrl: string) => {
    const response = await sendExtensionMessage<{
      success: boolean;
      data: { granted: boolean };
    }>({
      type: 'CHECK_PERMISSION',
      payload: { moodleUrl },
    });
    return response?.success === true && response.data.granted === true;
  }, []);

  const requestPermission = useCallback(async (moodleUrl: string) => {
    const response = await sendExtensionMessage<{
      success: boolean;
      error?: string;
    }>({
      type: 'REQUEST_PERMISSION',
      payload: { moodleUrl },
    });
    return response?.success === true;
  }, []);

  const checkMoodleLogin = useCallback(async (moodleUrl: string) => {
    const response = await sendExtensionMessage<{
      success: boolean;
      data: { loggedIn: boolean };
    }>({
      type: 'CHECK_LOGIN',
      payload: { moodleUrl },
    });
    if (!response?.success) return null;
    return response.data;
  }, []);

  const scrapeCourses = useCallback(async (moodleUrl: string) => {
    const response = await sendExtensionMessage<{
      success: boolean;
      data: {
        courses: Array<{ moodleCourseId: string; name: string; url: string }>;
      };
      error?: string;
    }>({
      type: 'SCRAPE_COURSES',
      payload: { moodleUrl },
    });
    if (!response) return null;
    if (!response.success) {
      throw new Error(
        (response as { error?: string }).error ?? 'Scraping failed',
      );
    }
    return response.data;
  }, []);

  const scrapeCourseContent = useCallback(async (courseUrl: string) => {
    const response = await sendExtensionMessage<{
      success: boolean;
      data: {
        sections: Array<{
          moodleSectionId: string;
          title: string;
          position: number;
          items: Array<{
            type: 'file' | 'link';
            name: string;
            moodleUrl: string;
            externalUrl?: string;
            fileSize?: number;
            mimeType?: string;
          }>;
        }>;
      };
      error?: string;
    }>({
      type: 'SCRAPE_COURSE_CONTENT',
      payload: { courseUrl },
    });
    if (!response) return null;
    if (!response.success) {
      throw new Error(
        (response as { error?: string }).error ?? 'Content scraping failed',
      );
    }
    return response.data;
  }, []);

  const downloadAndUpload = useCallback(
    async (params: {
      moodleFileUrl: string;
      uploadEndpoint: string;
      authToken?: string;
      metadata: { sectionId: string; moodleUrl: string; fileName: string };
    }) => {
      const response = await sendExtensionMessage<{
        success: boolean;
        data: {
          contentHash: string;
          fileSize: number;
          mimeType: string;
          deduplicated: boolean;
        };
        error?: string;
      }>({
        type: 'DOWNLOAD_AND_UPLOAD',
        payload: params,
      });
      if (!response?.success) {
        throw new Error(
          (response as { error?: string })?.error ?? 'Download/upload failed',
        );
      }
      return response.data;
    },
    [],
  );

  return {
    state,
    isInstalled: state.status === 'installed',
    isChecking: state.status === 'checking',
    ping,
    checkPermission,
    requestPermission,
    checkMoodleLogin,
    scrapeCourses,
    scrapeCourseContent,
    downloadAndUpload,
  };
}
```

- [ ] **Step 4: Run the full test file and confirm all tests pass**

```bash
pnpm test src/hooks/use-moodle-extension.test.ts
```

Expected: all tests (old + 5 new) pass.

- [ ] **Step 5: Run the broader unit suite to confirm no consumer broke**

```bash
pnpm test
```

Expected: all tests pass (consumers still see `isInstalled` and `isChecking` because we kept them as derived booleans).

- [ ] **Step 6: Commit**

```bash
git add src/hooks/use-moodle-extension.ts src/hooks/use-moodle-extension.test.ts
git commit -m "feat: extension state machine with 2s timeout + version handshake

Adds discriminated-union ExtensionState exposed alongside the existing
isInstalled/isChecking booleans (kept as derived values for backward
compat). PING is now bounded by a 2s timeout; version is compared
against EXPECTED_EXTENSION_VERSION ('0.2.0'). Logs a dev-only warning
when NEXT_PUBLIC_EXTENSION_ID is unset."
```

---

## Task 7: Update `<MoodleSyncPrompt>` to render install/update/skeleton states

Switch the component from `isInstalled`/`isChecking` to the new `state` discriminated union. Render the skeleton during `checking`, an Install card during `not-installed`, an Update card during `version-mismatch`, and continue to the existing flow during `installed`.

**Files:**

- Modify: `src/components/dashboard/moodle-sync-prompt.tsx`
- Create: `src/components/dashboard/moodle-sync-prompt.test.tsx` (if missing) — or modify if it exists

- [ ] **Step 1: Check whether a test file for `MoodleSyncPrompt` exists**

```bash
ls src/components/dashboard/moodle-sync-prompt.test.tsx 2>/dev/null || echo "not present — will be created"
```

- [ ] **Step 2: Write failing tests for the new state-driven rendering**

Create or replace `src/components/dashboard/moodle-sync-prompt.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ExtensionState } from '@/hooks/use-moodle-extension';

vi.mock('@/hooks/use-moodle-extension', () => ({
  useMoodleExtension: vi.fn(),
  EXPECTED_EXTENSION_VERSION: '0.2.0',
}));

import { useMoodleExtension } from '@/hooks/use-moodle-extension';
import { MoodleSyncPrompt } from './moodle-sync-prompt';

function setState(state: ExtensionState) {
  vi.mocked(useMoodleExtension).mockReturnValue({
    state,
    isInstalled: state.status === 'installed',
    isChecking: state.status === 'checking',
    ping: vi.fn(),
    checkPermission: vi.fn(),
    requestPermission: vi.fn(),
    checkMoodleLogin: vi.fn(),
    scrapeCourses: vi.fn(),
    scrapeCourseContent: vi.fn(),
    downloadAndUpload: vi.fn(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

beforeEach(() => vi.clearAllMocks());

describe('MoodleSyncPrompt', () => {
  it('renders the skeleton while extension is checking', () => {
    setState({ status: 'checking' });
    const { container } = render(
      <MoodleSyncPrompt moodleConnection={null} onSyncClick={() => {}} />,
    );
    expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument();
  });

  it('renders the Install card when extension is not installed', () => {
    setState({ status: 'not-installed' });
    render(<MoodleSyncPrompt moodleConnection={null} onSyncClick={() => {}} />);
    expect(
      screen.getByText(/install the typenote extension/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /install extension/i }),
    ).toBeDisabled();
  });

  it('renders the Update card with both versions when version mismatches', () => {
    setState({ status: 'version-mismatch', installedVersion: '0.1.0' });
    render(<MoodleSyncPrompt moodleConnection={null} onSyncClick={() => {}} />);
    expect(
      screen.getByText(/update the typenote extension/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/0\.1\.0/)).toBeInTheDocument();
    expect(screen.getByText(/0\.2\.0/)).toBeInTheDocument();
  });

  it('renders the connection-setup card when extension is installed but not connected', () => {
    setState({ status: 'installed', version: '0.2.0' });
    render(<MoodleSyncPrompt moodleConnection={null} onSyncClick={() => {}} />);
    expect(screen.getByLabelText(/moodle url/i)).toBeInTheDocument();
  });

  it('renders the Sync button when extension is installed AND connected', () => {
    setState({ status: 'installed', version: '0.2.0' });
    render(
      <MoodleSyncPrompt
        moodleConnection={{ domain: 'moodle.test.ac.il', instanceId: 'abc' }}
        onSyncClick={() => {}}
      />,
    );
    expect(
      screen.getByRole('button', { name: /sync with moodle/i }),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run the test and confirm it fails**

```bash
pnpm test src/components/dashboard/moodle-sync-prompt.test.tsx
```

Expected: the new "update card" and skeleton tests fail (the others may also fail depending on current output).

- [ ] **Step 4: Rewrite `src/components/dashboard/moodle-sync-prompt.tsx`**

Replace the entire file with:

```tsx
'use client';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  useMoodleExtension,
  EXPECTED_EXTENSION_VERSION,
} from '@/hooks/use-moodle-extension';
import { MoodleCardSkeleton } from './moodle-card-skeleton';
import { MoodleConnectionSetup } from './moodle-connection-setup';

interface MoodleSyncPromptProps {
  moodleConnection: { domain: string; instanceId: string } | null;
  onSyncClick: () => void;
}

export function MoodleSyncPrompt({
  moodleConnection,
  onSyncClick,
}: MoodleSyncPromptProps) {
  const { state } = useMoodleExtension();

  if (state.status === 'checking') {
    return <MoodleCardSkeleton />;
  }

  if (state.status === 'not-installed') {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Moodle Integration</CardTitle>
          <CardDescription>
            Install the Typenote extension to sync your Moodle courses and
            materials automatically.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" size="sm" disabled>
            Install Extension
          </Button>
          <p className="mt-2 text-xs text-muted-foreground">
            Coming soon to the Chrome Web Store. Refresh this page after
            installing.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (state.status === 'version-mismatch') {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Moodle Integration</CardTitle>
          <CardDescription>
            Update the Typenote extension to continue syncing. Installed
            version: <strong>{state.installedVersion}</strong>. Required:{' '}
            <strong>{EXPECTED_EXTENSION_VERSION}</strong>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" size="sm" disabled>
            Update Extension
          </Button>
          <p className="mt-2 text-xs text-muted-foreground">
            Refresh this page after updating.
          </p>
        </CardContent>
      </Card>
    );
  }

  // state.status === 'installed'
  if (!moodleConnection) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Moodle Integration</CardTitle>
          <CardDescription>
            Enter your Moodle URL to start syncing courses.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MoodleConnectionSetup />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Moodle Integration</CardTitle>
        <CardDescription>
          Connected to <strong>{moodleConnection.domain}</strong>. Sync your
          courses and materials.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button size="sm" onClick={onSyncClick}>
          Sync with Moodle
        </Button>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 5: Run the tests and confirm they pass**

```bash
pnpm test src/components/dashboard/moodle-sync-prompt.test.tsx
```

Expected: all 5 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/components/dashboard/moodle-sync-prompt.tsx src/components/dashboard/moodle-sync-prompt.test.tsx
git commit -m "feat: render install/update/skeleton states in MoodleSyncPrompt"
```

---

## Task 8: Wrap Moodle entry points with `<ExtensionGate>`

The dashboard currently renders `<MoodleSyncPromptWrapper>` unconditionally. Wrap it in `<ExtensionGate>` so iPad/mobile/Firefox/Safari users see no Moodle UI at all.

**Files:**

- Modify: `src/components/dashboard/moodle-sync-prompt-wrapper.tsx`

- [ ] **Step 1: Read the current wrapper to understand its shape**

```bash
cat src/components/dashboard/moodle-sync-prompt-wrapper.tsx
```

- [ ] **Step 2: Wrap the returned JSX in `<ExtensionGate>`**

Edit `src/components/dashboard/moodle-sync-prompt-wrapper.tsx`. Find the `import` block and add:

```tsx
import { ExtensionGate } from './extension-gate';
```

Then wrap the existing return expression. The component currently returns something like:

```tsx
return (
  <>
    <MoodleSyncPrompt … />
    {open && <MoodleSyncDialog … />}
  </>
);
```

Replace the outer wrapper so it becomes:

```tsx
return (
  <ExtensionGate>
    <MoodleSyncPrompt … />
    {open && <MoodleSyncDialog … />}
  </ExtensionGate>
);
```

(Preserve all existing props and conditional logic exactly — only the wrapping element changes.)

- [ ] **Step 3: Verify by running the full unit suite**

```bash
pnpm test
```

Expected: all existing tests pass. (No new tests in this task — gating coverage comes via Playwright in Task 14.)

- [ ] **Step 4: Manually smoke-test in dev**

```bash
pnpm dev
```

Open `http://localhost:3000/dashboard` in Chrome. The Moodle card should still appear (you're on Chromium desktop). Open Chrome DevTools → Device Toolbar → select iPad Pro 11 → reload. The Moodle card should disappear.

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/moodle-sync-prompt-wrapper.tsx
git commit -m "feat: gate Moodle UI behind ExtensionGate (hide on touch/non-Chromium)"
```

---

## Task 9: `<MoodleConnectionSetup>` — request permission on save + show banner if missing

When the user enters a Moodle URL and clicks Connect, immediately call `requestPermission(origin)` so Chrome shows its native permission prompt. If granted, save. If denied, surface a toast. Additionally, on mount: if a connection already exists, run `checkPermission` and show a "Grant access to {domain}" banner if it returns false.

**Files:**

- Modify: `src/components/dashboard/moodle-connection-setup.tsx`
- Modify: `src/components/dashboard/moodle-connection-setup.test.tsx`

- [ ] **Step 1: Replace `src/components/dashboard/moodle-connection-setup.test.tsx` with the new test suite**

The existing test file has 4 tests against the old `isInstalled`/`isChecking` API; we replace it wholesale so the file matches the new state-machine API and adds permission-flow coverage. Overwrite the file with:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/hooks/use-moodle-extension', () => ({
  useMoodleExtension: vi.fn(),
  EXPECTED_EXTENSION_VERSION: '0.2.0',
}));

vi.mock('@/lib/actions/moodle-sync', () => ({
  saveMoodleConnection: vi.fn(),
  removeMoodleConnection: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import {
  useMoodleExtension,
  type ExtensionState,
} from '@/hooks/use-moodle-extension';
import { MoodleConnectionSetup } from './moodle-connection-setup';
import { saveMoodleConnection } from '@/lib/actions/moodle-sync';

const mockUseMoodleExtension = useMoodleExtension as ReturnType<typeof vi.fn>;

function mockExtension(
  state: ExtensionState,
  overrides: {
    requestPermission?: ReturnType<typeof vi.fn>;
    checkPermission?: ReturnType<typeof vi.fn>;
  } = {},
) {
  mockUseMoodleExtension.mockReturnValue({
    state,
    isInstalled: state.status === 'installed',
    isChecking: state.status === 'checking',
    requestPermission:
      overrides.requestPermission ?? vi.fn().mockResolvedValue(true),
    checkPermission:
      overrides.checkPermission ?? vi.fn().mockResolvedValue(true),
    ping: vi.fn(),
    checkMoodleLogin: vi.fn(),
    scrapeCourses: vi.fn(),
    scrapeCourseContent: vi.fn(),
    downloadAndUpload: vi.fn(),
  });
}

describe('MoodleConnectionSetup', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('renders nothing while the extension is still being checked', () => {
    mockExtension({ status: 'checking' });
    const { container } = render(<MoodleConnectionSetup />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when the extension is not installed', () => {
    mockExtension({ status: 'not-installed' });
    const { container } = render(<MoodleConnectionSetup />);
    expect(container.firstChild).toBeNull();
  });

  it('shows URL input when extension is installed and no connection saved', () => {
    mockExtension({ status: 'installed', version: '0.2.0' });
    render(<MoodleConnectionSetup />);
    expect(screen.getByLabelText(/moodle url/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /connect/i }),
    ).toBeInTheDocument();
  });

  it('shows current connection when one is provided', () => {
    mockExtension({ status: 'installed', version: '0.2.0' });
    render(
      <MoodleConnectionSetup
        currentConnection={{ domain: 'moodle.test.ac.il', instanceId: '123' }}
      />,
    );
    expect(screen.getByText(/moodle\.test\.ac\.il/i)).toBeInTheDocument();
    expect(screen.getByText(/disconnect/i)).toBeInTheDocument();
  });

  it('calls requestPermission with the Moodle origin on Connect', async () => {
    const requestPermission = vi.fn().mockResolvedValue(true);
    mockExtension(
      { status: 'installed', version: '0.2.0' },
      { requestPermission },
    );
    vi.mocked(saveMoodleConnection).mockResolvedValue(undefined);

    render(<MoodleConnectionSetup />);
    await userEvent.type(
      screen.getByLabelText(/moodle url/i),
      'https://moodle.test.ac.il',
    );
    await userEvent.click(screen.getByRole('button', { name: /connect/i }));

    await waitFor(() => {
      expect(requestPermission).toHaveBeenCalledWith(
        'https://moodle.test.ac.il',
      );
    });
    expect(saveMoodleConnection).toHaveBeenCalledWith('moodle.test.ac.il');
  });

  it('shows permission-required error when the user denies the Chrome prompt', async () => {
    const requestPermission = vi.fn().mockResolvedValue(false);
    mockExtension(
      { status: 'installed', version: '0.2.0' },
      { requestPermission },
    );

    render(<MoodleConnectionSetup />);
    await userEvent.type(
      screen.getByLabelText(/moodle url/i),
      'https://moodle.test.ac.il',
    );
    await userEvent.click(screen.getByRole('button', { name: /connect/i }));

    await waitFor(() => expect(requestPermission).toHaveBeenCalled());
    expect(saveMoodleConnection).not.toHaveBeenCalled();
    expect(screen.getByText(/permission required/i)).toBeInTheDocument();
  });

  it('renders the Grant Access banner when an existing connection lacks permission', async () => {
    const checkPermission = vi.fn().mockResolvedValue(false);
    mockExtension(
      { status: 'installed', version: '0.2.0' },
      { checkPermission },
    );

    render(
      <MoodleConnectionSetup
        currentConnection={{ domain: 'moodle.test.ac.il', instanceId: '123' }}
      />,
    );

    await waitFor(() => {
      expect(checkPermission).toHaveBeenCalledWith('https://moodle.test.ac.il');
    });
    expect(
      screen.getByRole('button', {
        name: /grant access to moodle\.test\.ac\.il/i,
      }),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

```bash
pnpm test src/components/dashboard/moodle-connection-setup.test.tsx
```

Expected: most tests fail — the file references the new `state` API and behaviors that don't exist yet in the component.

- [ ] **Step 3: Rewrite `src/components/dashboard/moodle-connection-setup.tsx`**

Replace the entire file with:

```tsx
'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useMoodleExtension } from '@/hooks/use-moodle-extension';
import {
  saveMoodleConnection,
  removeMoodleConnection,
} from '@/lib/actions/moodle-sync';
import { toast } from 'sonner';

interface MoodleConnectionSetupProps {
  currentConnection?: {
    domain: string;
    instanceId: string;
  } | null;
}

export function MoodleConnectionSetup({
  currentConnection,
}: MoodleConnectionSetupProps) {
  const { state, checkPermission, requestPermission } = useMoodleExtension();
  const [url, setUrl] = useState(
    currentConnection?.domain ? `https://${currentConnection.domain}` : '',
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [permissionMissing, setPermissionMissing] = useState(false);

  // On mount with an existing connection, verify the extension still has host permission.
  useEffect(() => {
    if (!currentConnection || state.status !== 'installed') return;
    let cancelled = false;
    checkPermission(`https://${currentConnection.domain}`).then((granted) => {
      if (!cancelled) setPermissionMissing(!granted);
    });
    return () => {
      cancelled = true;
    };
  }, [currentConnection, state.status, checkPermission]);

  if (state.status === 'checking') {
    return null;
  }

  // Parent (MoodleSyncPrompt) only renders us when state === 'installed', but be safe.
  if (state.status !== 'installed') {
    return null;
  }

  async function handleSave() {
    setError(null);
    setSaving(true);
    try {
      let domain: string;
      try {
        const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
        const basePath = parsed.pathname
          .replace(
            /\/(my|course|login|mod|lib|theme|admin|message|calendar|user|badges|grade|report|backup|blocks|question|tag|cohort|enrol|webservice|auth|completion|files|search)\b.*/,
            '',
          )
          .replace(/\/+$/, '');
        domain = parsed.host + basePath;
      } catch {
        setError('Please enter a valid URL');
        setSaving(false);
        return;
      }

      if (!domain || domain.length < 3) {
        setError('Please enter a valid Moodle URL');
        setSaving(false);
        return;
      }

      const granted = await requestPermission(`https://${domain}`);
      if (!granted) {
        setError(
          'Permission required. Allow access to this Moodle domain in the popup, or click Connect again.',
        );
        setSaving(false);
        return;
      }

      await saveMoodleConnection(domain);
      setPermissionMissing(false);
      toast.success('Moodle connection saved');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to save connection',
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleGrantExisting() {
    if (!currentConnection) return;
    const granted = await requestPermission(
      `https://${currentConnection.domain}`,
    );
    if (granted) {
      setPermissionMissing(false);
      toast.success(`Access granted to ${currentConnection.domain}`);
    } else {
      toast.error('Permission required. Try again from chrome://extensions.');
    }
  }

  async function handleRemove() {
    try {
      await removeMoodleConnection();
      setUrl('');
      setPermissionMissing(false);
      toast.success('Moodle connection removed');
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Failed to remove connection',
      );
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="moodle-url">Moodle URL</Label>
        <div className="flex gap-2">
          <Input
            id="moodle-url"
            placeholder="moodle.university.ac.il/2026"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={saving}
          />
          <Button onClick={handleSave} disabled={saving || !url.trim()}>
            {saving ? 'Saving...' : currentConnection ? 'Update' : 'Connect'}
          </Button>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      {currentConnection && (
        <div className="flex items-center justify-between rounded-md border px-3 py-2">
          <span className="text-sm">
            Connected to <strong>{currentConnection.domain}</strong>
          </span>
          <Button variant="ghost" size="sm" onClick={handleRemove}>
            Disconnect
          </Button>
        </div>
      )}

      {currentConnection && permissionMissing && (
        <div className="flex items-center justify-between rounded-md border border-amber-400/40 bg-amber-50 dark:bg-amber-950/30 px-3 py-2">
          <p className="text-sm">
            The extension needs access to{' '}
            <strong>{currentConnection.domain}</strong> to sync.
          </p>
          <Button size="sm" onClick={handleGrantExisting}>
            Grant access to {currentConnection.domain}
          </Button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

```bash
pnpm test src/components/dashboard/moodle-connection-setup.test.tsx
```

Expected: all tests (existing + 3 new) pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/moodle-connection-setup.tsx src/components/dashboard/moodle-connection-setup.test.tsx
git commit -m "feat: request per-domain Moodle permission on save; show banner if missing"
```

---

## Task 10: `<MoodleSyncDialog>` — wrap debug payload + show network-error message

Two cosmetic-but-meaningful changes: hide the raw "Page: '…' (N cards)" debug payload behind `<details>` so users don't see noise, and recognize network failures so the error reads "Couldn't reach {domain}..." instead of a raw "fetch failed" string.

**Files:**

- Modify: `src/components/dashboard/moodle-sync-dialog.tsx`

- [ ] **Step 1: Add the `isNetworkError` helper alongside `isAuthError`**

In `src/components/dashboard/moodle-sync-dialog.tsx` find this block (around line 67):

```ts
const AUTH_ERROR_PATTERNS = [
  '403',
  'forbidden',
  'unauthorized',
  'login required',
  'session expired',
];

function isAuthError(message: string): boolean {
  const lower = message.toLowerCase();
  return AUTH_ERROR_PATTERNS.some((p) => lower.includes(p));
}
```

Add immediately after it:

```ts
const NETWORK_ERROR_PATTERNS = ['network', 'fetch', 'timeout', 'offline'];

function isNetworkError(message: string): boolean {
  const lower = message.toLowerCase();
  return NETWORK_ERROR_PATTERNS.some((p) => lower.includes(p));
}
```

- [ ] **Step 2: Track network errors in component state**

In the component body (with the other `useState` calls around line 99-106), add:

```ts
const [networkError, setNetworkError] = useState(false);
```

- [ ] **Step 3: Set it in the existing error catch blocks**

Find the catch block at the end of `loadCourses` (around line 320-326) and update it from:

```ts
} catch (err) {
  const message =
    err instanceof Error ? err.message : 'Failed to load courses';
  setError(message);
  setAuthError(isAuthError(message));
  setPhase('error');
}
```

to:

```ts
} catch (err) {
  const message =
    err instanceof Error ? err.message : 'Failed to load courses';
  setError(message);
  setAuthError(isAuthError(message));
  setNetworkError(isNetworkError(message) && !isAuthError(message));
  setPhase('error');
}
```

Apply the same `setNetworkError(...)` line to the catch block in `handlePreviewContent` (around line 429) and the one in `handleSync` (around line 560).

- [ ] **Step 4: Wrap the raw debug payload in `<details>`**

Find this block around line 290:

```ts
if (scrapeResult.courses.length === 0) {
  const debug = (scrapeResult as Record<string, unknown>)._debug as
    | { title: string; url: string; cardCount: number }
    | undefined;
  setError(
    `No courses found. ` +
      (debug
        ? `Page: "${debug.title}" at ${debug.url} (${debug.cardCount} cards)`
        : 'No debug info available.'),
  );
  setPhase('error');
  return;
}
```

Replace the `setError` call with:

```ts
setError('No courses found on Moodle.');
const debug = (scrapeResult as Record<string, unknown>)._debug as
  | { title: string; url: string; cardCount: number }
  | undefined;
if (debug) {
  setDebugInfo(
    `Page: "${debug.title}" at ${debug.url} (${debug.cardCount} cards)`,
  );
}
```

And introduce state for `debugInfo`:

```ts
const [debugInfo, setDebugInfo] = useState<string | null>(null);
```

(Add this `useState` alongside the others.)

- [ ] **Step 5: Update the error-rendering block to use the new state**

Find the error-rendering JSX near the end (around line 869-892):

```tsx
{error && phase !== 'select-content' && (
  <div className="space-y-2">
    <p
      className="text-sm text-destructive whitespace-pre-wrap"
      role="alert"
    >
      {error}
    </p>
    {authError && (
      <p className="text-xs text-muted-foreground">
        Your Moodle session may have expired.{' '}
        <a … >Re-log into Moodle</a> and try again.
      </p>
    )}
  </div>
)}
```

Replace it with:

```tsx
{
  error && phase !== 'select-content' && (
    <div className="space-y-2">
      <p className="text-sm text-destructive whitespace-pre-wrap" role="alert">
        {networkError && !authError
          ? `Couldn't reach ${moodleConnection.domain}. Check your internet and try again.`
          : error}
      </p>
      {authError && (
        <p className="text-xs text-muted-foreground">
          Your Moodle session may have expired.{' '}
          <a
            href={`https://${moodleConnection.domain}`}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            Re-log into Moodle
          </a>{' '}
          and try again.
        </p>
      )}
      {debugInfo && (
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer">Debug info</summary>
          <pre className="mt-1 whitespace-pre-wrap">{debugInfo}</pre>
        </details>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Reset `networkError` and `debugInfo` in `loadCourses` (so retries clear them)**

In `loadCourses` at the top, where it currently sets `setError(null); setAuthError(false);`, add two lines:

```ts
setNetworkError(false);
setDebugInfo(null);
```

- [ ] **Step 7: Run the full unit suite**

```bash
pnpm test
```

Expected: all tests pass (no test changes — these are mostly cosmetic improvements; existing test coverage in `moodle-sync-dialog.test.tsx` if any continues to apply).

- [ ] **Step 8: Commit**

```bash
git add src/components/dashboard/moodle-sync-dialog.tsx
git commit -m "feat: friendlier network-error message + debug payload behind <details>"
```

---

## Task 11: `<MoodleSyncDialog>` — "Retry failed" button after partial sync

Track failed download jobs in state and let the user re-run just those without restarting the whole sync.

**Files:**

- Modify: `src/components/dashboard/moodle-sync-dialog.tsx`

- [ ] **Step 1: Add failed-jobs state**

Near the other `useState` declarations around line 130, add:

```ts
const [failedJobs, setFailedJobs] = useState<
  Array<{ moodleUrl: string; fileName: string; sectionId: string }>
>([]);
```

- [ ] **Step 2: Track failed jobs in `handleSync`**

Inside the `for (const job of fileJobs)` loop in `handleSync` (around line 525), change the `catch` block from:

```ts
} catch (dlErr) {
  failed++;
  if (errors.length < 3) {
    errors.push(
      `${job.fileName}: ${dlErr instanceof Error ? dlErr.message : String(dlErr)}`,
    );
  }
}
```

to:

```ts
} catch (dlErr) {
  failed++;
  if (errors.length < 3) {
    errors.push(
      `${job.fileName}: ${dlErr instanceof Error ? dlErr.message : String(dlErr)}`,
    );
  }
  setFailedJobs((prev) => [...prev, job]);
}
```

Also clear `failedJobs` at the start of `handleSync` (right after `setError(null)`):

```ts
setFailedJobs([]);
```

- [ ] **Step 3: Extract the per-job download loop into a helper inside the component**

Above `handleSync`, add:

```ts
async function runDownloadJobs(
  jobs: Array<{ moodleUrl: string; fileName: string; sectionId: string }>,
  authToken: string | undefined,
  uploadEndpoint: string,
): Promise<{
  downloaded: number;
  failed: number;
  failedJobs: typeof jobs;
  errors: string[];
}> {
  let downloaded = 0;
  let failed = 0;
  const errors: string[] = [];
  const newFailed: typeof jobs = [];

  for (const job of jobs) {
    try {
      await downloadAndUpload({
        moodleFileUrl: job.moodleUrl,
        uploadEndpoint,
        authToken,
        metadata: {
          sectionId: job.sectionId,
          moodleUrl: job.moodleUrl,
          fileName: job.fileName,
        },
      });
      downloaded++;
    } catch (dlErr) {
      failed++;
      if (errors.length < 3) {
        errors.push(
          `${job.fileName}: ${dlErr instanceof Error ? dlErr.message : String(dlErr)}`,
        );
      }
      newFailed.push(job);
    }
    setProgress(`Downloading files... (${downloaded + failed}/${jobs.length})`);
  }
  return { downloaded, failed, failedJobs: newFailed, errors };
}
```

Then replace the inline download loop in `handleSync` with a call to this helper, and update `setFailedJobs(result.failedJobs)` from the return value.

- [ ] **Step 4: Add a `handleRetryFailed` function**

Below `handleSync`:

```ts
async function handleRetryFailed() {
  if (failedJobs.length === 0) return;
  setPhase('syncing');
  setError(null);
  setProgress(`Retrying ${failedJobs.length} failed file(s)...`);

  const {
    data: { session },
  } = await supabaseRef.current.auth.getSession();
  const authToken = session?.access_token;
  const uploadEndpoint = `${window.location.origin}/api/moodle/upload`;

  const result = await runDownloadJobs(failedJobs, authToken, uploadEndpoint);
  setDownloadedCount((prev) => prev + result.downloaded);
  setFailedCount(result.failed);
  setFailedJobs(result.failedJobs);
  if (result.errors.length > 0) {
    setError(
      `${result.failed} file(s) still failed:\n${result.errors.join('\n')}`,
    );
  } else {
    setError(null);
  }
  setPhase('done');
}
```

- [ ] **Step 5: Add the "Retry failed" button to the `done` footer**

Find the `done` phase footer (around line 917):

```tsx
{
  phase === 'done' && (
    <Button onClick={() => onOpenChange(false)}>Close</Button>
  );
}
```

Replace with:

```tsx
{
  phase === 'done' && (
    <div className="flex gap-2">
      {failedJobs.length > 0 && (
        <Button variant="outline" onClick={handleRetryFailed}>
          Retry failed ({failedJobs.length})
        </Button>
      )}
      <Button onClick={() => onOpenChange(false)}>Close</Button>
    </div>
  );
}
```

- [ ] **Step 6: Run the full unit suite**

```bash
pnpm test
```

Expected: passes.

- [ ] **Step 7: Commit**

```bash
git add src/components/dashboard/moodle-sync-dialog.tsx
git commit -m "feat: 'Retry failed' button re-runs only the failed download jobs"
```

---

## Task 12: `<MoodleSyncDialog>` — Grant Permission fallback when revoked mid-flow

If a user revokes per-domain permission via `chrome://extensions` while the dialog is open, the next scrape call throws a permission error. Catch it and offer an inline "Grant Permission" button that calls `requestPermission` and retries.

**Files:**

- Modify: `src/components/dashboard/moodle-sync-dialog.tsx`

- [ ] **Step 1: Add a `isPermissionError` helper alongside the others**

Just below `isNetworkError` (from Task 10):

```ts
const PERMISSION_ERROR_PATTERNS = [
  'permission',
  'host not allowed',
  'no access',
];

function isPermissionError(message: string): boolean {
  const lower = message.toLowerCase();
  return PERMISSION_ERROR_PATTERNS.some((p) => lower.includes(p));
}
```

- [ ] **Step 2: Track permission errors in state and pull in `requestPermission`**

In the component body, add:

```ts
const [permissionError, setPermissionError] = useState(false);
```

And update the destructure of `useMoodleExtension` at the top of the component (around line 95) from:

```ts
const { scrapeCourses, scrapeCourseContent, downloadAndUpload } =
  useMoodleExtension();
```

to:

```ts
const {
  scrapeCourses,
  scrapeCourseContent,
  downloadAndUpload,
  requestPermission,
} = useMoodleExtension();
```

- [ ] **Step 3: Set `permissionError` in the catch blocks**

In each of the three catch blocks (`loadCourses`, `handlePreviewContent`, `handleSync`), add a line:

```ts
setPermissionError(isPermissionError(message) && !isAuthError(message));
```

(directly below the existing `setNetworkError` line from Task 10).

Also reset it at the top of `loadCourses`:

```ts
setPermissionError(false);
```

- [ ] **Step 4: Add a "Grant Permission" handler**

Below the existing handlers:

```ts
async function handleGrantPermission() {
  const granted = await requestPermission(`https://${moodleConnection.domain}`);
  if (granted) {
    setPermissionError(false);
    loadCourses();
  } else {
    setError(
      `Permission still denied for ${moodleConnection.domain}. Try granting via chrome://extensions.`,
    );
  }
}
```

- [ ] **Step 5: Render the Grant Permission button when the error fires**

Inside the error-rendering JSX (the block you modified in Task 10), below the `authError` section and before the `debugInfo` block, add:

```tsx
{
  permissionError && (
    <div className="flex items-center gap-2">
      <p className="text-xs text-muted-foreground flex-1">
        The extension lost access to {moodleConnection.domain}. Grant permission
        again to continue.
      </p>
      <Button size="sm" onClick={handleGrantPermission}>
        Grant Permission
      </Button>
    </div>
  );
}
```

- [ ] **Step 6: Run the full unit suite**

```bash
pnpm test
```

Expected: passes.

- [ ] **Step 7: Commit**

```bash
git add src/components/dashboard/moodle-sync-dialog.tsx
git commit -m "feat: 'Grant Permission' fallback when host permission is revoked mid-flow"
```

---

## Task 13: Playwright spec — Moodle UI hidden on touch viewport

One spec, two assertions: card hidden on iPad viewport, visible on desktop viewport. Doesn't load the real extension — it tests the gating layer, not the sync flow.

**Files:**

- Create: `e2e/moodle-touch-gating.spec.ts`
- Modify: `e2e/TEST_REGISTRY.md`

- [ ] **Step 1: Create `e2e/moodle-touch-gating.spec.ts`**

```ts
import { test, expect, devices } from '@playwright/test';
import { login } from './helpers/auth';

const MOODLE_CARD_TEXT = /moodle integration/i;

test.describe('Moodle UI — touch / non-Chromium gating', () => {
  test('Moodle card is hidden on iPad viewport (pointer: coarse)', async ({
    browser,
  }) => {
    const context = await browser.newContext({
      ...devices['iPad Pro 11'],
    });
    const page = await context.newPage();
    await login(page);
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText(MOODLE_CARD_TEXT)).toHaveCount(0);

    await context.close();
  });

  test('Moodle card is visible on desktop viewport (pointer: fine)', async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    });
    const page = await context.newPage();
    await login(page);
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // Either the install card, update card, or connected card — any state is fine.
    await expect(page.getByText(MOODLE_CARD_TEXT)).toBeVisible();

    await context.close();
  });
});
```

- [ ] **Step 2: Add an entry to `e2e/TEST_REGISTRY.md`**

Open `e2e/TEST_REGISTRY.md` and add a new section (following the existing pattern for sections like "Auth" and "Documents"):

```markdown
## Moodle Extension Gating (`e2e/moodle-touch-gating.spec.ts`) — IMPLEMENTED

- [x] Moodle card is hidden on iPad viewport (pointer: coarse)
- [x] Moodle card is visible on desktop viewport (pointer: fine)

---
```

Place it alphabetically (or following the existing section order).

- [ ] **Step 3: Run the new spec**

```bash
pnpm test:e2e e2e/moodle-touch-gating.spec.ts
```

Expected: both tests pass. (If the desktop test fails because `NEXT_PUBLIC_EXTENSION_ID` is unset and the install card text doesn't include "Moodle Integration" — check that the test selector matches the heading you produced in Task 7.)

- [ ] **Step 4: Commit**

```bash
git add e2e/moodle-touch-gating.spec.ts e2e/TEST_REGISTRY.md
git commit -m "test: e2e gating — Moodle UI hidden on touch, visible on desktop"
```

---

## Task 14: Write `extension/QUICKSTART.md`

A single document covering: local setup, a 10-step smoke flow, and a 3-flow pre-release manual checklist for real-credentials testing. This is what makes the extension reproducibly verifiable.

**Files:**

- Create: `extension/QUICKSTART.md`

- [ ] **Step 1: Create the file**

````markdown
# Typenote Moodle Extension — Quickstart

This guide walks you through building, loading, and verifying the extension end-to-end on your machine. The full automated suite covers gating logic and unit-level behavior; the steps below cover the real-Chrome-extension flow that can't be automated cheaply.

## Prerequisites

- pnpm, Node 22+
- Google Chrome (or another Chromium-family browser — Edge, Brave, Arc all work)
- A real Moodle account at a university you can log into

## Build & load (one-time)

1. **Build the extension bundle.**
   ```bash
   pnpm --filter typenote-moodle-extension build
   ```
````

Produces `extension/dist/service-worker.js` and `extension/dist/moodle-scraper.js`.

2. **Open `chrome://extensions`** in Chrome.

3. **Enable "Developer mode"** (toggle, top right).

4. **Click "Load unpacked"** and select the `extension/` folder from this repo. The extension card should appear with name "Typenote Moodle Sync" and version `0.2.0`.

5. **Copy the extension ID** shown on the card (a 32-character lowercase string).

6. **Add it to `.env.local`:**

   ```
   NEXT_PUBLIC_EXTENSION_ID=<paste-the-id-here>
   ```

7. **Restart `pnpm dev`** (the env var is read at startup, not per-request).

## 10-step smoke checklist

After the one-time setup, run through this list. Each step lists the _expected_ outcome — flag any deviation.

1. `pnpm dev` → open `http://localhost:3000/dashboard` → log in.
   **Expect:** A "Moodle Integration" card on the dashboard with a URL input.

2. Open DevTools → Device Toolbar → select **iPad Pro 11** → reload.
   **Expect:** The Moodle card disappears entirely (touch gating).

3. Switch back to a desktop viewport → reload.
   **Expect:** The Moodle card reappears.

4. Enter your real Moodle URL (e.g. `moodle.runi.ac.il/2026`) → click **Connect**.
   **Expect:** Chrome shows a native permission popup asking access to `https://moodle.runi.ac.il/*`. Click **Allow**.

5. The card should now say "Connected to moodle.runi.ac.il" with a **Sync with Moodle** button.

6. Open `moodle.runi.ac.il` in another tab → log in to your Moodle account.

7. Return to the Typenote tab → click **Sync with Moodle**.
   **Expect:** A dialog opens, scrapes courses, and shows a course list with status badges ("New", "Synced", etc.).

8. Select **one course** → click **Preview Content**.
   **Expect:** Section/file list appears, with files already in the registry shown as "synced".

9. Select **one small file** in a section → click **Sync Selected**.
   **Expect:** Progress text "Downloading files... (1/1)" → "Successfully synced 1 course" with `1 file downloaded`.

10. Check Supabase Storage (Studio at `http://localhost:54323`) → bucket `moodle-materials` → the new file should be present.

If all 10 pass, the happy path is healthy.

## Pre-release manual checklist (real-credentials only)

These exercise the failure paths. Run them before bumping to a new release.

### A. Auth expiry mid-sync

1. Start a sync (open the dialog, get to the course-selection phase).
2. In your other Moodle tab, log out.
3. Continue the sync. **Expect:** the dialog surfaces "Your Moodle session may have expired" with a "Re-log into Moodle" link.

### B. Permission revocation mid-flow

1. Start a sync.
2. Open `chrome://extensions` → Typenote Moodle Sync → "Details" → toggle "Site access" off for your Moodle domain.
3. Retry the sync. **Expect:** the dialog shows the inline "Grant Permission" button. Click it → native popup → Allow → sync resumes.

### C. Large-course download with intentional flake

1. Sync a course with 20+ files.
2. Mid-download, kill your network briefly (e.g. macOS Network → toggle Wi-Fi off for 5 s, then on).
3. **Expect:** some files fail. After the run completes, the "done with errors" screen shows a **Retry failed (N)** button. Click it. **Expect:** failures retry; on success the screen flips to clean success.

---

## Troubleshooting

- **"Install Extension" card stays visible even after loading the unpacked extension.**
  `NEXT_PUBLIC_EXTENSION_ID` isn't matching the unpacked ID. Recopy from `chrome://extensions` and restart `pnpm dev`.

- **Permission popup never appears.**
  The manifest probably wasn't rebuilt after a change. Run `pnpm --filter typenote-moodle-extension build` and reload the extension at `chrome://extensions`.

- **"Update Extension" card.**
  The loaded extension's manifest `version` doesn't match `EXPECTED_EXTENSION_VERSION` in `src/hooks/use-moodle-extension.ts`. Rebuild the extension or update the constant in lockstep.

````

- [ ] **Step 2: Commit**

```bash
git add extension/QUICKSTART.md
git commit -m "docs(extension): quickstart with smoke checklist and pre-release manual flows"
````

---

## Task 15: Final verification sweep

Run all three test layers per CLAUDE.md, build the production bundle, and walk through the smoke checklist one time end-to-end.

- [ ] **Step 1: Run the unit suite**

```bash
pnpm test
```

Expected: all green.

- [ ] **Step 2: Run the integration suite**

```bash
pnpm test:integration
```

Expected: all green.

- [ ] **Step 3: Run the E2E suite (Playwright)**

```bash
pnpm test:e2e
```

Expected: all green, including the new `moodle-touch-gating.spec.ts`.

- [ ] **Step 4: Run the production build to catch any TypeScript/lint regression**

```bash
pnpm build
```

Expected: build succeeds.

- [ ] **Step 5: Manually walk steps 1–10 of `extension/QUICKSTART.md` once**

Confirm each step's expected outcome matches reality.

- [ ] **Step 6: Push the branch and open a PR against `dev`**

```bash
git push -u origin feat/extension-readiness
gh pr create --base dev --title "feat: extension readiness — gating, version handshake, manifest tightening" --body "$(cat <<'EOF'
## Summary

- Gates the Moodle UI behind `<ExtensionGate>` so it only renders on Chromium-family desktop browsers (silent hide on touch/non-Chromium).
- Upgrades `useMoodleExtension` to a discriminated-union state machine with a 2s detection timeout and a version handshake against `EXPECTED_EXTENSION_VERSION` (`0.2.0`).
- Tightens `extension/manifest.json` — `<all_urls>` moves from `host_permissions` to `optional_host_permissions`. The connection setup now requests per-domain permission at runtime via `chrome.permissions.request()`.
- Adds `MoodleCardSkeleton` + new install/update card UI for the new detection states.
- Adds `<details>`-wrapped debug payload, friendlier network-error messaging, a "Retry failed" button, and a "Grant Permission" fallback inside `<MoodleSyncDialog>`.

## Out of scope (deferred)

- Actual Chrome Web Store upload + listing.
- Wiring the "Install Extension" button to a real CWS URL.
- Auto-detection after install (today: refresh).

## Test plan

- [x] `pnpm test` — unit
- [x] `pnpm test:integration` — integration
- [x] `pnpm test:e2e` — including new `moodle-touch-gating.spec.ts`
- [x] `pnpm build` — production
- [x] Manual: 10-step smoke flow in `extension/QUICKSTART.md`

Spec: `docs/superpowers/specs/2026-05-13-extension-readiness-design.md`
Plan: `docs/superpowers/plans/2026-05-13-extension-readiness.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 7: Confirm CI passes on the PR**

Watch the GitHub Actions checks on the PR page. All required checks (lint, format, unit, integration, build, E2E) must pass before merging.

---

## Self-review notes

- **Spec coverage:** Goals (gating, bounded detection, manifest tightening, local-dev path) → tasks 8/13/3/5/6/9 (gating), 6 (bounded detection), 2 (manifest), 14 (local-dev). Non-goals (CWS upload, install URL wiring, auto-detect) → explicitly noted in PR description.
- **State matrix coverage:** Level 1 (platform) → tasks 3+5+8. Level 2 (extension detection) → tasks 6+7. Level 3 (connection + permission) → task 9. Level 4 (login) → unchanged from current code; surfaced in dialog. Level 5 (sync dialog) → tasks 10–12.
- **Error handling coverage:** Class A (detection) → task 6. Class B (permission) → tasks 9, 12. Class C (login & scrape) → task 10. Class D (download/upload) → task 11.
- **Verification coverage:** Vitest → tasks 3, 4, 5, 6, 7, 9. Playwright → task 13. Manual smoke + pre-release → task 14.
- **Type consistency:** `ExtensionState` shape and `EXPECTED_EXTENSION_VERSION` constant defined in task 6, referenced consistently in tasks 7, 9, 12, 14.
- **No placeholders:** every code step includes the full content. The one exception is task 9 step 1, which asks the engineer to read the existing test file before adapting the new test cases — necessary because the existing test scaffolding pattern may differ.
