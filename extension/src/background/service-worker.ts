/**
 * Extension service worker -- handles messages from Typenote web app.
 * Implements: PING, CHECK_LOGIN, SCRAPE_COURSES, SCRAPE_COURSE_CONTENT,
 * DOWNLOAD_AND_UPLOAD, REQUEST_PERMISSION
 *
 * Communication flow:
 *  1. Typenote web app sends message via chrome.runtime.sendMessage()
 *  2. Service worker receives via onMessageExternal
 *  3. For scraping: injects content script into Moodle tab via chrome.scripting
 *  4. Returns scraped data to web app
 */

import type {
  ExtensionRequest,
  ExtensionResponse,
  PingData,
  LoginStatusData,
  ScrapedCoursesData,
  ScrapedCourseContentData,
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

async function handleMessage(message: ExtensionRequest): Promise<ExtensionResponse> {
  switch (message.type) {
    case 'PING':
      return { success: true, data: { version: EXTENSION_VERSION } as PingData };

    case 'CHECK_LOGIN':
      return await handleCheckLogin(message.payload.moodleUrl);

    case 'SCRAPE_COURSES':
      return await handleScrapeCourses(message.payload.moodleUrl);

    case 'SCRAPE_COURSE_CONTENT':
      return await handleScrapeCourseContent(message.payload.courseUrl);

    case 'DOWNLOAD_AND_UPLOAD':
      return await handleDownloadAndUpload(message.payload);

    case 'CHECK_PERMISSION': {
      const checkUrl = new URL(message.payload.moodleUrl);
      const checkOrigin = `${checkUrl.protocol}//${checkUrl.host}/*`;
      try {
        const has = await chrome.permissions.contains({ origins: [checkOrigin] });
        return { success: true, data: { granted: has } };
      } catch (err) {
        return { success: false, error: String(err) };
      }
    }

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

// ============================================
// Helper: find or create a tab for a Moodle URL
// ============================================

/**
 * Finds an existing tab matching the Moodle origin, or creates a new one.
 * Returns the tab ID.
 */
async function getOrCreateMoodleTab(moodleUrl: string): Promise<number> {
  const url = new URL(moodleUrl);
  const origin = `${url.protocol}//${url.host}`;

  // Look for an existing Moodle tab
  const tabs = await chrome.tabs.query({ url: `${origin}/*` });
  if (tabs.length > 0 && tabs[0].id !== undefined) {
    return tabs[0].id;
  }

  // Create a new tab (in background, minimized)
  const tab = await chrome.tabs.create({ url: moodleUrl, active: false, pinned: true });
  if (!tab.id) throw new Error('Failed to create tab');

  // Wait for the tab to finish loading
  await waitForTabLoad(tab.id);
  return tab.id;
}

/**
 * Waits for a tab to finish loading.
 */
function waitForTabLoad(tabId: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error('Tab load timeout'));
    }, 30_000);

    const listener = (
      updatedTabId: number,
      changeInfo: chrome.tabs.TabChangeInfo,
    ) => {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        clearTimeout(timeout);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };

    chrome.tabs.onUpdated.addListener(listener);
  });
}

// ============================================
// Helper: inject scraper and execute a function
// ============================================

/**
 * Injects the moodle-scraper content script into a tab and executes
 * one of its exported functions, returning the result.
 */
async function executeScraperFunction<T>(
  tabId: number,
  functionName: string,
): Promise<T> {
  // Check current tab URL for debugging
  const tab = await chrome.tabs.get(tabId);
  const tabUrl = tab.url ?? '';

  // Inject the scraper content script
  let results;
  try {
    results = await chrome.scripting.executeScript({
      target: { tabId },
      files: ['dist/moodle-scraper.js'],
    });
  } catch (err) {
    // If injection failed, it's likely a redirect to SSO or permission issue
    const msg = String(err);
    if (tabUrl && !tabUrl.startsWith('chrome')) {
      throw new Error(
        `Cannot access page at: ${tabUrl.substring(0, 100)}. ` +
        'You may need to log into Moodle in this browser first.',
      );
    }
    throw new Error(msg);
  }

  if (!results || results.length === 0) {
    throw new Error('Script injection failed');
  }

  // Execute the specific scraper function
  const execResults = await chrome.scripting.executeScript({
    target: { tabId },
    func: (fnName: string) => {
      // The scraper module is available as window.__typenote_scraper
      // after the content script bundles it
      const scraper = (window as unknown as Record<string, unknown>).__typenote_scraper as
        Record<string, () => unknown> | undefined;
      if (!scraper || typeof scraper[fnName] !== 'function') {
        throw new Error(`Scraper function "${fnName}" not found`);
      }
      return scraper[fnName]();
    },
    args: [functionName],
  });

  if (!execResults || execResults.length === 0) {
    throw new Error('Script execution failed');
  }

  const result = execResults[0].result;
  if (result === undefined || result === null) {
    throw new Error(`Scraper function "${functionName}" returned no data`);
  }

  return result as T;
}

// ============================================
// Handler: CHECK_LOGIN
// ============================================

async function handleCheckLogin(
  moodleUrl: string,
): Promise<ExtensionResponse> {
  try {
    // Quick cookie check first — MoodleSession cookie indicates a session
    const url = new URL(moodleUrl);
    const cookies = await chrome.cookies.getAll({ domain: url.hostname });
    const hasSession = cookies.some(
      (c) => c.name === 'MoodleSession' || c.name.startsWith('MoodleSession'),
    );

    if (!hasSession) {
      return { success: true, data: { loggedIn: false } as LoginStatusData };
    }

    // Cookie exists, but may be expired — verify by injecting into a tab
    const tabId = await getOrCreateMoodleTab(moodleUrl);
    const data = await executeScraperFunction<LoginStatusData>(
      tabId,
      'scrapeLoginStatus',
    );
    return { success: true, data };
  } catch (err) {
    return { success: false, error: `Login check failed: ${String(err)}` };
  }
}

// ============================================
// Handler: SCRAPE_COURSES
// ============================================

async function handleScrapeCourses(
  moodleUrl: string,
): Promise<ExtensionResponse> {
  try {
    // moodleUrl is the base URL (e.g. https://moodle.runi.ac.il/2026)
    const base = moodleUrl.replace(/\/+$/, '');
    const coursesPageUrl = `${base}/my/courses.php`;

    const tabId = await getOrCreateMoodleTab(coursesPageUrl);

    // Navigate if tab is not already on the courses page
    const tab = await chrome.tabs.get(tabId);
    if (tab.url !== coursesPageUrl) {
      await chrome.tabs.update(tabId, { url: coursesPageUrl });
      await waitForTabLoad(tabId);
    }

    const data = await executeScraperFunction<ScrapedCoursesData>(
      tabId,
      'scrapeCourses',
    );
    return { success: true, data };
  } catch (err) {
    return { success: false, error: `Course scraping failed: ${String(err)}` };
  }
}

// ============================================
// Handler: SCRAPE_COURSE_CONTENT
// ============================================

async function handleScrapeCourseContent(
  courseUrl: string,
): Promise<ExtensionResponse> {
  try {
    const tabId = await getOrCreateMoodleTab(courseUrl);

    // Navigate to the course page
    const tab = await chrome.tabs.get(tabId);
    if (tab.url !== courseUrl) {
      await chrome.tabs.update(tabId, { url: courseUrl });
      await waitForTabLoad(tabId);
    }

    // First pass: scrape what's visible (section 0 + tile metadata)
    const data = await executeScraperFunction<ScrapedCourseContentData>(
      tabId,
      'scrapeCourseContent',
    );

    // For tiles format: sections with no items need content loaded.
    // We scrape each section by navigating to its section page.
    for (const section of data.sections) {
      if (section.items.length === 0 && section.moodleSectionId !== '0') {
        try {
          const sectionPageUrl = courseUrl.replace(
            /\/course\/view\.php.*/,
            `/course/section.php?id=${section.moodleSectionId}`,
          );
          await chrome.tabs.update(tabId, { url: sectionPageUrl });
          await waitForTabLoad(tabId);

          const items = await executeScraperFunction<
            ScrapedCourseContentData['sections'][0]['items']
          >(tabId, 'scrapeSectionPage');

          section.items = items;
        } catch {
          // Section load failed — leave items empty, will retry on next sync
        }
      }
    }

    return { success: true, data };
  } catch (err) {
    return {
      success: false,
      error: `Course content scraping failed: ${String(err)}`,
    };
  }
}

// ============================================
// Handler: DOWNLOAD_AND_UPLOAD
// ============================================

async function handleDownloadAndUpload(
  payload: ExtensionRequest & { type: 'DOWNLOAD_AND_UPLOAD' } extends { payload: infer P }
    ? P
    : never,
): Promise<ExtensionResponse> {
  try {
    const { moodleFileUrl, uploadEndpoint, metadata } = payload;

    // Download the file using the student's Moodle session cookies
    const response = await fetch(moodleFileUrl, {
      credentials: 'include',
      redirect: 'follow',
    });

    if (!response.ok) {
      throw new Error(`Download failed: ${response.status} ${response.statusText}`);
    }

    const blob = await response.blob();
    const arrayBuffer = await blob.arrayBuffer();

    // Compute SHA-256 content hash for deduplication
    const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const contentHash = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

    // Upload to Typenote backend
    const formData = new FormData();
    formData.append('file', new Blob([arrayBuffer], { type: blob.type }), metadata.fileName);
    formData.append('contentHash', contentHash);
    formData.append('sectionId', metadata.sectionId);
    formData.append('moodleUrl', metadata.moodleUrl);
    formData.append('fileName', metadata.fileName);
    formData.append('fileSize', String(blob.size));
    formData.append('mimeType', blob.type);

    const uploadHeaders: Record<string, string> = {};
    if ((payload as Record<string, unknown>).authToken) {
      uploadHeaders['Authorization'] = `Bearer ${(payload as Record<string, unknown>).authToken}`;
    }

    const uploadResponse = await fetch(uploadEndpoint, {
      method: 'POST',
      body: formData,
      headers: uploadHeaders,
    });

    if (!uploadResponse.ok) {
      throw new Error(`Upload failed: ${uploadResponse.status} ${uploadResponse.statusText}`);
    }

    const uploadResult = await uploadResponse.json();

    return {
      success: true,
      data: {
        contentHash,
        fileSize: blob.size,
        mimeType: blob.type,
        deduplicated: uploadResult.deduplicated ?? false,
      },
    };
  } catch (err) {
    return { success: false, error: `Download/upload failed: ${String(err)}` };
  }
}
