'use client';

import { useState, useEffect, useCallback } from 'react';

const EXTENSION_ID = process.env.NEXT_PUBLIC_EXTENSION_ID ?? '';

interface ExtensionState {
  isInstalled: boolean;
  isChecking: boolean;
}

/**
 * Send a message to the Typenote Moodle extension.
 * Returns null if extension is not installed.
 */
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

export function useMoodleExtension() {
  const [state, setState] = useState<ExtensionState>({
    isInstalled: false,
    isChecking: true,
  });

  // Ping extension on mount to check if installed
  useEffect(() => {
    async function checkExtension() {
      const response = await sendExtensionMessage<{ success: boolean }>({
        type: 'PING',
      });
      setState({
        isInstalled: response?.success === true,
        isChecking: false,
      });
    }
    checkExtension();
  }, []);

  const ping = useCallback(async () => {
    const response = await sendExtensionMessage<{ success: boolean; data: { version: string } }>({
      type: 'PING',
    });
    return response?.success ? response.data : null;
  }, []);

  const checkPermission = useCallback(async (moodleUrl: string) => {
    const response = await sendExtensionMessage<{ success: boolean; data: { granted: boolean } }>({
      type: 'CHECK_PERMISSION',
      payload: { moodleUrl },
    });
    return response?.success === true && response.data.granted === true;
  }, []);

  const requestPermission = useCallback(async (moodleUrl: string) => {
    const response = await sendExtensionMessage<{ success: boolean; error?: string }>({
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
      throw new Error((response as { error?: string }).error ?? 'Scraping failed');
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
      throw new Error((response as { error?: string }).error ?? 'Content scraping failed');
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
        throw new Error((response as { error?: string })?.error ?? 'Download/upload failed');
      }
      return response.data;
    },
    [],
  );

  return {
    ...state,
    ping,
    checkPermission,
    requestPermission,
    checkMoodleLogin,
    scrapeCourses,
    scrapeCourseContent,
    downloadAndUpload,
  };
}
