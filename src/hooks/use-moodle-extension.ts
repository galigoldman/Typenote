'use client';

import { useState, useEffect, useCallback } from 'react';
import { isAtLeastVersion } from '@/lib/version';

const EXTENSION_ID = process.env.NEXT_PUBLIC_EXTENSION_ID ?? '';
// Lowest extension version the web app supports. The installed extension may
// be this version OR NEWER — we no longer require an exact match, so a Web
// Store auto-update that bumps the extension ahead of a web deploy (or vice
// versa) doesn't block syncing during the rollout window.
export const MINIMUM_EXTENSION_VERSION = '0.2.0';
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
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch(() => {
        clearTimeout(timer);
        resolve(null);
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
      if (!isAtLeastVersion(version, MINIMUM_EXTENSION_VERSION)) {
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

  /**
   * Asks the extension for permission to access a Moodle host. Because
   * `chrome.permissions.request` requires a user gesture (which we don't
   * have from a web-page message), the service worker stashes the host and
   * returns `code: 'NEEDS_POPUP'`. The caller must then instruct the user
   * to click the toolbar icon, and poll `checkPermission` until granted.
   */
  const requestPermission = useCallback(async (moodleUrl: string) => {
    const response = await sendExtensionMessage<{
      success: boolean;
      error?: string;
      code?: string;
      data?: { host?: string };
    }>({
      type: 'REQUEST_PERMISSION',
      payload: { moodleUrl },
    });
    if (response?.success === true) {
      return { granted: true as const };
    }
    if (response?.code === 'NEEDS_POPUP' && response.data?.host) {
      return {
        granted: false as const,
        needsPopup: true as const,
        host: response.data.host,
      };
    }
    return { granted: false as const, error: response?.error };
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
      code?: string;
    }>({
      type: 'SCRAPE_COURSES',
      payload: { moodleUrl },
    });
    if (!response) return null;
    if (!response.success) {
      const err = new Error(response.error ?? 'Scraping failed') as Error & {
        code?: string;
      };
      err.code = response.code;
      throw err;
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
      code?: string;
    }>({
      type: 'SCRAPE_COURSE_CONTENT',
      payload: { courseUrl },
    });
    if (!response) return null;
    if (!response.success) {
      const err = new Error(
        response.error ?? 'Content scraping failed',
      ) as Error & { code?: string };
      err.code = response.code;
      throw err;
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
