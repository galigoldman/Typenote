import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

// Set env var BEFORE importing the hook so the module-level constant picks it up
vi.stubEnv('NEXT_PUBLIC_EXTENSION_ID', 'test-extension-id');

// Mock chrome.runtime
const mockSendMessage = vi.fn();

beforeEach(() => {
  vi.resetAllMocks();
  // Setup global chrome mock
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
    mockSendMessage.mockImplementation((_id: string, _msg: unknown, callback: Function) => {
      (globalThis as any).chrome.runtime.lastError = { message: 'Extension not found' };
      callback(undefined);
      (globalThis as any).chrome.runtime.lastError = null;
    });

    const { result } = renderHook(() => useMoodleExtension());

    await waitFor(() => {
      expect(result.current.isChecking).toBe(false);
    });

    expect(result.current.isInstalled).toBe(false);
  });

  it('detects extension as installed when ping succeeds', async () => {
    mockSendMessage.mockImplementation((_id: string, _msg: unknown, callback: Function) => {
      callback({ success: true, data: { version: '0.1.0' } });
    });

    const { result } = renderHook(() => useMoodleExtension());

    await waitFor(() => {
      expect(result.current.isChecking).toBe(false);
    });

    expect(result.current.isInstalled).toBe(true);
  });

  it('checkMoodleLogin returns login status', async () => {
    mockSendMessage.mockImplementation((_id: string, _msg: unknown, callback: Function) => {
      callback({ success: true, data: { loggedIn: true } });
    });

    const { result } = renderHook(() => useMoodleExtension());

    await waitFor(() => expect(result.current.isChecking).toBe(false));

    const loginStatus = await result.current.checkMoodleLogin('https://moodle.test.ac.il');
    expect(loginStatus).toEqual({ loggedIn: true });
  });

  it('scrapeCourses returns course list', async () => {
    const courses = [
      { moodleCourseId: '101', name: 'Intro to CS', url: 'https://moodle.test.ac.il/course/view.php?id=101' },
    ];

    mockSendMessage.mockImplementation((_id: string, _msg: unknown, callback: Function) => {
      callback({ success: true, data: { courses } });
    });

    const { result } = renderHook(() => useMoodleExtension());
    await waitFor(() => expect(result.current.isChecking).toBe(false));

    const data = await result.current.scrapeCourses('https://moodle.test.ac.il');
    expect(data?.courses).toEqual(courses);
  });

  it('returns null when extension not available', async () => {
    mockSendMessage.mockImplementation((_id: string, _msg: unknown, callback: Function) => {
      (globalThis as any).chrome.runtime.lastError = { message: 'not found' };
      callback(undefined);
      (globalThis as any).chrome.runtime.lastError = null;
    });

    const { result } = renderHook(() => useMoodleExtension());
    await waitFor(() => expect(result.current.isChecking).toBe(false));

    const data = await result.current.scrapeCourses('https://moodle.test.ac.il');
    expect(data).toBeNull();
  });
});
