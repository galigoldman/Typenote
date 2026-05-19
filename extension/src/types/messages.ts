/**
 * Message types for communication between the Typenote web app
 * and the Chrome extension via chrome.runtime.sendMessage.
 */

// ============================================
// Request types (Web App -> Extension)
// ============================================

export interface PingRequest {
  type: 'PING';
}

export interface CheckLoginRequest {
  type: 'CHECK_LOGIN';
  payload: {
    moodleUrl: string;
  };
}

export interface ScrapCoursesRequest {
  type: 'SCRAPE_COURSES';
  payload: {
    moodleUrl: string;
  };
}

export interface ScrapeCourseContentRequest {
  type: 'SCRAPE_COURSE_CONTENT';
  payload: {
    courseUrl: string;
  };
}

export interface DownloadAndUploadRequest {
  type: 'DOWNLOAD_AND_UPLOAD';
  payload: {
    moodleFileUrl: string;
    uploadEndpoint: string;
    authToken?: string;
    metadata: {
      sectionId: string;
      moodleUrl: string;
      fileName: string;
    };
  };
}

export interface CheckPermissionRequest {
  type: 'CHECK_PERMISSION';
  payload: {
    moodleUrl: string;
  };
}

export interface RequestPermissionRequest {
  type: 'REQUEST_PERMISSION';
  payload: {
    moodleUrl: string;
  };
}

export type ExtensionRequest =
  | PingRequest
  | CheckLoginRequest
  | ScrapCoursesRequest
  | ScrapeCourseContentRequest
  | DownloadAndUploadRequest
  | CheckPermissionRequest
  | RequestPermissionRequest;

// ============================================
// Response types (Extension -> Web App)
// ============================================

export interface ExtensionSuccessResponse<T = unknown> {
  success: true;
  data: T;
}

/**
 * Stable error codes. The web app branches its UI on these — keep them
 * machine-readable and stable. The `error` field is the human-readable
 * fallback for unknown codes or developer logs.
 */
export type ExtensionErrorCode =
  // Permission was requested by the web app but Chrome won't grant it without
  // a user gesture. The host has been stashed; the popup will pick it up the
  // next time the user clicks the toolbar icon.
  | 'NEEDS_POPUP'
  // The user is not authenticated to Moodle (no session cookie, or the
  // courses page redirected to a login URL).
  | 'NOT_LOGGED_IN'
  // The extension has no host permission for the target Moodle host.
  | 'PERMISSION_DENIED';

export interface ExtensionErrorResponse {
  success: false;
  error: string;
  code?: ExtensionErrorCode;
  // For NEEDS_POPUP: which host the popup will grant.
  data?: { host?: string };
}

export type ExtensionResponse<T = unknown> =
  | ExtensionSuccessResponse<T>
  | ExtensionErrorResponse;

// ============================================
// Response data shapes
// ============================================

export interface PingData {
  version: string;
}

export interface LoginStatusData {
  loggedIn: boolean;
}

export interface ScrapedCourse {
  moodleCourseId: string;
  name: string;
  url: string;
}

export interface ScrapedCoursesData {
  courses: ScrapedCourse[];
}

export interface ScrapedItem {
  type: 'file' | 'link';
  name: string;
  moodleUrl: string;
  externalUrl?: string;
  fileSize?: number;
  mimeType?: string;
}

export interface ScrapedSection {
  moodleSectionId: string;
  title: string;
  position: number;
  items: ScrapedItem[];
}

export interface ScrapedCourseContentData {
  sections: ScrapedSection[];
}

export interface DownloadUploadData {
  contentHash: string;
  fileSize: number;
  mimeType: string;
  deduplicated: boolean;
}
