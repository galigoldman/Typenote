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
      chrome.runtime.sendMessage(EXTENSION_ID, message, (response: T) => {
        if (chrome.runtime.lastError) {
          resolve(null);
          return;
        }
        resolve(response);
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
    }>({
      type: 'SCRAPE_COURSES',
      payload: { moodleUrl },
    });
    if (!response?.success) return null;
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
    }>({
      type: 'SCRAPE_COURSE_CONTENT',
      payload: { courseUrl },
    });
    if (!response?.success) return null;
    return response.data;
  }, []);

  const downloadAndUpload = useCallback(
    async (params: {
      moodleFileUrl: string;
      uploadEndpoint: string;
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
      if (!response?.success) return null;
      return response.data;
    },
    [],
  );

  return {
    ...state,
    ping,
    requestPermission,
    checkMoodleLogin,
    scrapeCourses,
    scrapeCourseContent,
    downloadAndUpload,
  };
}
