/**
 * Extension service worker -- handles messages from Typenote web app.
 * Implements: PING, CHECK_LOGIN, SCRAPE_COURSES, SCRAPE_COURSE_CONTENT,
 * DOWNLOAD_AND_UPLOAD, REQUEST_PERMISSION
 */

import type {
  ExtensionRequest,
  ExtensionResponse,
  PingData,
} from '../types/messages';

const EXTENSION_VERSION = '0.1.0';

// Listen for messages from the Typenote web app
chrome.runtime.onMessageExternal.addListener(
  (
    message: ExtensionRequest,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: ExtensionResponse) => void,
  ) => {
    handleMessage(message)
      .then(sendResponse)
      .catch((err) => sendResponse({ success: false, error: String(err) }));
    return true; // Keep message channel open for async response
  },
);

async function handleMessage(
  message: ExtensionRequest,
): Promise<ExtensionResponse> {
  switch (message.type) {
    case 'PING':
      return {
        success: true,
        data: { version: EXTENSION_VERSION } as PingData,
      };

    case 'CHECK_LOGIN':
      // TODO: Implement Moodle login detection
      return { success: true, data: { loggedIn: false } };

    case 'SCRAPE_COURSES':
      // TODO: Implement Moodle course scraping
      return { success: true, data: { courses: [] } };

    case 'SCRAPE_COURSE_CONTENT':
      // TODO: Implement course content scraping
      return { success: true, data: { sections: [] } };

    case 'DOWNLOAD_AND_UPLOAD':
      // TODO: Implement file download and upload
      return { success: false, error: 'Not yet implemented' };

    case 'REQUEST_PERMISSION': {
      const url = new URL(message.payload.moodleUrl);
      const origin = `${url.protocol}//${url.host}/*`;
      try {
        const granted = await chrome.permissions.request({ origins: [origin] });
        if (granted) {
          return { success: true, data: {} };
        }
        return { success: false, error: 'User denied permission' };
      } catch (err) {
        return { success: false, error: String(err) };
      }
    }

    default:
      return { success: false, error: `Unknown message type` };
  }
}
