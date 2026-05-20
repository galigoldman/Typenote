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

const EXTENSION_VERSION = '0.2.0';

// ============================================
// Pending permission stash
// ============================================
// When the web app requests permission for a Moodle host, we can't call
// chrome.permissions.request() here (no user gesture). Instead we stash
// the request and let the popup pick it up next time the user opens it.

interface PendingPermission {
  host: string;
  origin: string;
  createdAt: number;
}

const PENDING_KEY = 'pendingPermission';

async function stashPendingPermission(host: string): Promise<void> {
  const pending: PendingPermission = {
    host,
    origin: `https://${host}/*`,
    createdAt: Date.now(),
  };
  await chrome.storage.session.set({ [PENDING_KEY]: pending });
}

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
        const has = await chrome.permissions.contains({
          origins: [checkOrigin],
        });
        return { success: true, data: { granted: has } };
      } catch (err) {
        return { success: false, error: String(err) };
      }
    }

    case 'REQUEST_PERMISSION': {
      // chrome.permissions.request requires a user gesture. onMessageExternal
      // is NOT a gesture context (even though a user clicked something on the
      // web app), so calling it here would always silently fail. Workaround:
      //   1. Stash the requested host in session storage.
      //   2. Auto-open the toolbar popup via chrome.action.openPopup
      //      (Chrome 127+, no user gesture required from the service worker).
      //   3. The popup reads the stash and lets the user click Allow — that
      //      click IS a gesture, so chrome.permissions.request inside the
      //      popup will display Chrome's native per-host prompt.
      // If openPopup fails (older Chrome, no focused window, blocked by
      // policy, etc.) the dialog falls back to "click the toolbar icon"
      // instructional copy — the NEEDS_POPUP response below tells it so.
      const url = new URL(message.payload.moodleUrl);
      const host = url.host;
      await stashPendingPermission(host);
      try {
        await chrome.action.openPopup();
      } catch {
        // Fallback path is fine — the web app shows instructions and polls.
      }
      return {
        success: false,
        error: `Permission for ${host} must be granted from the extension popup`,
        code: 'NEEDS_POPUP',
        data: { host },
      };
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
  const tab = await chrome.tabs.create({
    url: moodleUrl,
    active: false,
    pinned: true,
  });
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
/**
 * Detects whether a tab URL is a login redirect rather than the expected
 * Moodle page. Returns true if either:
 *   1. The hostname differs from the expected URL (Moodle bounced to an SSO
 *      provider on a different domain like `login.runi.ac.il` or `idp.*`).
 *      This is the canonical signal — if we cannot read the tab, mapping it
 *      to PERMISSION_DENIED would lie when the real cause is an expired
 *      session that triggered the redirect.
 *   2. The path looks like an in-domain login flow (`/login/`, `/auth/`,
 *      `sso`, `saml`) but is not the page we asked for.
 */
function isLoginRedirect(tabUrl: string, expectedUrl: string): boolean {
  if (!tabUrl) return false;
  let tabHost = '';
  let expectedHost = '';
  try {
    tabHost = new URL(tabUrl).hostname;
    expectedHost = new URL(expectedUrl).hostname;
  } catch {
    return false;
  }
  if (tabHost && expectedHost && tabHost !== expectedHost) return true;
  const expectedPath = (() => {
    try {
      return new URL(expectedUrl).pathname;
    } catch {
      return '';
    }
  })();
  return (
    /\/login\/|\/auth\/|sso|saml|oauth|idp\./i.test(tabUrl) &&
    !tabUrl.endsWith(expectedPath)
  );
}

/**
 * Custom error class so handlers can attach a structured error code that
 * the web app branches on (PERMISSION_DENIED vs NOT_LOGGED_IN vs raw).
 */
class ScraperError extends Error {
  constructor(
    message: string,
    public code?: 'PERMISSION_DENIED' | 'NOT_LOGGED_IN',
  ) {
    super(message);
  }
}

async function executeScraperFunction<T>(
  tabId: number,
  functionName: string,
): Promise<T> {
  // Check current tab URL for debugging
  const tab = await chrome.tabs.get(tabId);
  const tabUrl = tab.url ?? '';

  // Inject the scraper content script. Path must match the build output
  // (esbuild outdir=dist, source at src/content/moodle-scraper.ts → dist/content/moodle-scraper.js).
  let results;
  try {
    results = await chrome.scripting.executeScript({
      target: { tabId },
      files: ['dist/content/moodle-scraper.js'],
    });
  } catch (err) {
    const msg = String(err);
    // Chrome's "no host_permissions for this URL" comes in several variants:
    //   "Cannot access contents of the page."
    //   "Cannot access contents of url \"<URL>\"."
    //   "...must request permission to access [this|the respective] host."
    // Match the stable substrings so any of them route to the
    // permission-grant flow instead of looking like a login failure.
    if (/Cannot access contents|must request permission to access/i.test(msg)) {
      throw new ScraperError(
        `Extension does not have permission to access ${tabUrl.substring(0, 100)}.`,
        'PERMISSION_DENIED',
      );
    }
    if (tabUrl && !tabUrl.startsWith('chrome')) {
      throw new ScraperError(
        `Failed to inject scraper into ${tabUrl.substring(0, 100)}: ${msg}.`,
      );
    }
    throw new ScraperError(msg);
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
      const scraper = (window as unknown as Record<string, unknown>)
        .__typenote_scraper as Record<string, () => unknown> | undefined;
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

async function handleCheckLogin(moodleUrl: string): Promise<ExtensionResponse> {
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

    // Cookie exists, but may be expired — verify by injecting into a tab.
    const tabId = await getOrCreateMoodleTab(moodleUrl);
    const tab = await chrome.tabs.get(tabId);
    if (isLoginRedirect(tab.url ?? '', moodleUrl)) {
      // Moodle bounced the tab off-domain for SSO → server-side session is
      // dead. Treat as logged-out so callers (and the dashboard's
      // disambiguation) get a clean signal rather than a generic failure.
      return { success: true, data: { loggedIn: false } as LoginStatusData };
    }
    try {
      const data = await executeScraperFunction<LoginStatusData>(
        tabId,
        'scrapeLoginStatus',
      );
      return { success: true, data };
    } catch (err) {
      // If the script can't run because of a permission error AND the tab
      // is off-domain, that's still a login-expired signal — fail closed
      // to loggedIn:false instead of a generic error.
      if (
        err instanceof ScraperError &&
        err.code === 'PERMISSION_DENIED' &&
        isLoginRedirect(tab.url ?? '', moodleUrl)
      ) {
        return { success: true, data: { loggedIn: false } as LoginStatusData };
      }
      throw err;
    }
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
    const tab = await chrome.tabs.get(tabId);
    if (tab.url !== coursesPageUrl) {
      await chrome.tabs.update(tabId, { url: coursesPageUrl });
      await waitForTabLoad(tabId);
    }

    // If Moodle bounced an unauthenticated user, the tab URL is now a login
    // page rather than the courses page. This is a more reliable signal
    // than a cookie-name precheck, which couldn't fire if host_permissions
    // weren't yet granted for the Moodle domain.
    const tabAfter = await chrome.tabs.get(tabId);
    const tabUrl = tabAfter.url ?? '';
    if (isLoginRedirect(tabUrl, coursesPageUrl)) {
      return {
        success: false,
        error: `Moodle redirected to ${tabUrl.substring(0, 120)} — your session likely expired.`,
        code: 'NOT_LOGGED_IN',
      };
    }

    const data = await executeScraperFunction<ScrapedCoursesData>(
      tabId,
      'scrapeCourses',
    );
    return { success: true, data };
  } catch (err) {
    if (err instanceof ScraperError && err.code) {
      return { success: false, error: err.message, code: err.code };
    }
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

    const tabAfter = await chrome.tabs.get(tabId);
    const tabUrl = tabAfter.url ?? '';
    if (isLoginRedirect(tabUrl, courseUrl)) {
      return {
        success: false,
        error: `Moodle redirected to ${tabUrl.substring(0, 120)} — your session likely expired.`,
        code: 'NOT_LOGGED_IN',
      };
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
    if (err instanceof ScraperError && err.code) {
      return { success: false, error: err.message, code: err.code };
    }
    return {
      success: false,
      error: `Course content scraping failed: ${String(err)}`,
    };
  }
}

// ============================================
// Handler: DOWNLOAD_AND_UPLOAD
// ============================================

/**
 * Resolves a Moodle activity URL to the actual pluginfile.php download URL.
 * For view.php URLs: navigates a tab to the page and extracts the real URL
 * from the DOM (pluginfile.php links in embeds/iframes/download links).
 * For pluginfile.php URLs: returns as-is.
 */
async function resolveFileUrl(moodleUrl: string): Promise<string> {
  // Already a direct file URL
  if (moodleUrl.includes('/pluginfile.php')) {
    return moodleUrl;
  }

  // Navigate to the resource page and extract the real file URL
  if (
    moodleUrl.includes('/mod/resource/view.php') ||
    moodleUrl.includes('/mod/folder/view.php')
  ) {
    const tabId = await getOrCreateMoodleTab(moodleUrl);
    const tab = await chrome.tabs.get(tabId);
    if (tab.url !== moodleUrl) {
      await chrome.tabs.update(tabId, { url: moodleUrl });
      await waitForTabLoad(tabId);
    }

    try {
      const realUrl = await executeScraperFunction<string>(
        tabId,
        'scrapeFileUrl',
      );
      if (realUrl) return realUrl;
    } catch {
      // scrapeFileUrl returned null — no pluginfile.php link found on page
    }

    // Fallback: try redirect=1 parameter
    const sep = moodleUrl.includes('?') ? '&' : '?';
    return `${moodleUrl}${sep}redirect=1`;
  }

  return moodleUrl;
}

async function handleDownloadAndUpload(
  payload: ExtensionRequest & { type: 'DOWNLOAD_AND_UPLOAD' } extends {
    payload: infer P;
  }
    ? P
    : never,
): Promise<ExtensionResponse> {
  try {
    const { moodleFileUrl, uploadEndpoint, metadata } = payload;
    const authToken = (payload as Record<string, unknown>).authToken as
      | string
      | undefined;

    const downloadUrl = await resolveFileUrl(moodleFileUrl);

    const response = await fetch(downloadUrl, {
      credentials: 'include',
      redirect: 'follow',
    });
    if (!response.ok) {
      throw new Error(
        `Download failed: ${response.status} ${response.statusText}`,
      );
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('text/html')) {
      throw new Error(
        `Got HTML instead of file — could not resolve download URL. ` +
          `Resource: ${moodleFileUrl.substring(0, 80)}`,
      );
    }

    const blob = await response.blob();
    const arrayBuffer = await blob.arrayBuffer();

    const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
    const contentHash = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    // Two-phase upload. Streaming the file body through the Next.js API
    // route on Vercel is bounded by the Serverless body limit (4.5 MB on
    // Hobby), so we go direct-to-Storage via a one-time signed URL.
    //
    //   POST /api/moodle/upload-prepare → { uploadUrl, storagePath }
    //   PUT  uploadUrl                  → file bytes (any size)
    //   POST /api/moodle/upload-finalize → { fileId, deduplicated }
    //
    // The caller still passes `${origin}/api/moodle/upload` as
    // `uploadEndpoint` (legacy contract); we just take the origin off it.
    const baseOrigin = new URL(uploadEndpoint).origin;
    const prepareUrl = `${baseOrigin}/api/moodle/upload-prepare`;
    const finalizeUrl = `${baseOrigin}/api/moodle/upload-finalize`;

    const jsonHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (authToken) jsonHeaders['Authorization'] = `Bearer ${authToken}`;

    const prepareResp = await fetch(prepareUrl, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({
        sectionId: metadata.sectionId,
        fileName: metadata.fileName,
        contentHash,
      }),
    });
    if (!prepareResp.ok) {
      const body = await prepareResp.text().catch(() => '');
      throw new Error(
        `Upload prepare failed: ${prepareResp.status} ${prepareResp.statusText} ${body.slice(0, 200)}`,
      );
    }
    const { uploadUrl, storagePath } = (await prepareResp.json()) as {
      uploadUrl: string;
      storagePath: string;
    };

    const putResp = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': blob.type || 'application/octet-stream',
      },
      body: arrayBuffer,
    });
    if (!putResp.ok) {
      const body = await putResp.text().catch(() => '');
      throw new Error(
        `Storage PUT failed: ${putResp.status} ${putResp.statusText} ${body.slice(0, 200)}`,
      );
    }

    const finalizeResp = await fetch(finalizeUrl, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({
        sectionId: metadata.sectionId,
        moodleUrl: metadata.moodleUrl,
        fileName: metadata.fileName,
        contentHash,
        storagePath,
        fileSize: blob.size,
        mimeType: blob.type,
      }),
    });
    if (!finalizeResp.ok) {
      const body = await finalizeResp.text().catch(() => '');
      throw new Error(
        `Upload finalize failed: ${finalizeResp.status} ${finalizeResp.statusText} ${body.slice(0, 200)}`,
      );
    }

    const finalizeResult = (await finalizeResp.json()) as {
      deduplicated?: boolean;
    };

    return {
      success: true,
      data: {
        contentHash,
        fileSize: blob.size,
        mimeType: blob.type,
        deduplicated: finalizeResult.deduplicated ?? false,
      },
    };
  } catch (err) {
    return { success: false, error: `Download/upload failed: ${String(err)}` };
  }
}
