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

export interface ExtensionErrorResponse {
  success: false;
  error: string;
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
