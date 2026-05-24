import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

// Set env var BEFORE importing the hook so the module-level constant picks it up
vi.stubEnv('NEXT_PUBLIC_EXTENSION_ID', 'test-extension-id');

// Mock chrome.runtime
const mockSendMessage = vi.fn();

beforeEach(() => {
  vi.resetAllMocks();
  // Setup global chrome mock
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).chrome = {
    runtime: {
      sendMessage: mockSendMessage,
      lastError: null,
    },
  };
});

// Import AFTER stubbing env
const { useMoodleExtension } = await import('./use-moodle-extension');

describe('useMoodleExtension', () => {
  it('detects extension as not installed when ping fails', async () => {
    mockSendMessage.mockImplementation(
      (_id: string, _msg: unknown, callback: (...args: unknown[]) => void) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (globalThis as any).chrome.runtime.lastError = {
          message: 'Extension not found',
        };
        callback(undefined);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (globalThis as any).chrome.runtime.lastError = null;
      },
    );

    const { result } = renderHook(() => useMoodleExtension());

    await waitFor(() => {
      expect(result.current.isChecking).toBe(false);
    });

    expect(result.current.isInstalled).toBe(false);
  });

  it('detects extension as installed when ping succeeds', async () => {
    mockSendMessage.mockImplementation(
      (_id: string, _msg: unknown, callback: (...args: unknown[]) => void) => {
        callback({ success: true, data: { version: '0.2.0' } });
      },
    );

    const { result } = renderHook(() => useMoodleExtension());

    await waitFor(() => {
      expect(result.current.isChecking).toBe(false);
    });

    expect(result.current.isInstalled).toBe(true);
  });

  it('checkMoodleLogin returns login status', async () => {
    mockSendMessage.mockImplementation(
      (_id: string, _msg: unknown, callback: (...args: unknown[]) => void) => {
        callback({ success: true, data: { loggedIn: true } });
      },
    );

    const { result } = renderHook(() => useMoodleExtension());

    await waitFor(() => expect(result.current.isChecking).toBe(false));

    const loginStatus = await result.current.checkMoodleLogin(
      'https://moodle.test.ac.il',
    );
    expect(loginStatus).toEqual({ loggedIn: true });
  });

  it('scrapeCourses returns course list', async () => {
    const courses = [
      {
        moodleCourseId: '101',
        name: 'Intro to CS',
        url: 'https://moodle.test.ac.il/course/view.php?id=101',
      },
    ];

    mockSendMessage.mockImplementation(
      (_id: string, _msg: unknown, callback: (...args: unknown[]) => void) => {
        callback({ success: true, data: { courses } });
      },
    );

    const { result } = renderHook(() => useMoodleExtension());
    await waitFor(() => expect(result.current.isChecking).toBe(false));

    const data = await result.current.scrapeCourses(
      'https://moodle.test.ac.il',
    );
    expect(data?.courses).toEqual(courses);
  });

  it('returns null when extension not available', async () => {
    mockSendMessage.mockImplementation(
      (_id: string, _msg: unknown, callback: (...args: unknown[]) => void) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (globalThis as any).chrome.runtime.lastError = { message: 'not found' };
        callback(undefined);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (globalThis as any).chrome.runtime.lastError = null;
      },
    );

    const { result } = renderHook(() => useMoodleExtension());
    await waitFor(() => expect(result.current.isChecking).toBe(false));

    const data = await result.current.scrapeCourses(
      'https://moodle.test.ac.il',
    );
    expect(data).toBeNull();
  });

  it('exposes state.status="installed" with version when ping succeeds at the expected version', async () => {
    mockSendMessage.mockImplementation(
      (_id: string, _msg: unknown, callback: (...args: unknown[]) => void) => {
        callback({ success: true, data: { version: '0.2.0' } });
      },
    );

    const { result } = renderHook(() => useMoodleExtension());
    await waitFor(() =>
      expect(result.current.state.status).not.toBe('checking'),
    );

    expect(result.current.state).toEqual({
      status: 'installed',
      version: '0.2.0',
    });
    expect(result.current.isInstalled).toBe(true);
  });

  it('exposes state.status="version-mismatch" when the installed version is below the minimum', async () => {
    mockSendMessage.mockImplementation(
      (_id: string, _msg: unknown, callback: (...args: unknown[]) => void) => {
        callback({ success: true, data: { version: '0.1.0' } });
      },
    );

    const { result } = renderHook(() => useMoodleExtension());
    await waitFor(() =>
      expect(result.current.state.status).not.toBe('checking'),
    );

    expect(result.current.state).toEqual({
      status: 'version-mismatch',
      installedVersion: '0.1.0',
    });
    expect(result.current.isInstalled).toBe(false);
  });

  it('treats a version NEWER than the minimum as installed (no mismatch)', async () => {
    mockSendMessage.mockImplementation(
      (_id: string, _msg: unknown, callback: (...args: unknown[]) => void) => {
        callback({ success: true, data: { version: '0.3.0' } });
      },
    );

    const { result } = renderHook(() => useMoodleExtension());
    await waitFor(() =>
      expect(result.current.state.status).not.toBe('checking'),
    );

    expect(result.current.state).toEqual({
      status: 'installed',
      version: '0.3.0',
    });
    expect(result.current.isInstalled).toBe(true);
  });

  it('falls back to "not-installed" when the PING response is malformed', async () => {
    mockSendMessage.mockImplementation(
      (_id: string, _msg: unknown, callback: (...args: unknown[]) => void) => {
        callback({ success: true, data: {} });
      },
    );

    const { result } = renderHook(() => useMoodleExtension());
    await waitFor(() =>
      expect(result.current.state.status).not.toBe('checking'),
    );

    expect(result.current.state.status).toBe('not-installed');
  });

  it('times out to "not-installed" after 2 seconds when the extension never responds', async () => {
    vi.useFakeTimers();
    mockSendMessage.mockImplementation(() => {
      // never call the callback — simulates a hung extension
    });

    const { result } = renderHook(() => useMoodleExtension());

    // Advance fake timers past the 2s timeout, wrapped in act so React
    // flushes state updates that fire as a result of the timer advancing.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });

    expect(result.current.state.status).toBe('not-installed');
    vi.useRealTimers();
  });
});

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
