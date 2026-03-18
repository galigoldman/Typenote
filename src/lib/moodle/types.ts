/**
 * Moodle sync types used by the Next.js app for API payloads,
 * sync orchestration, and UI state.
 */

// ============================================
// Sync API request/response types
// ============================================

export interface SyncCoursePayload {
  moodleCourseId: string;
  name: string;
  moodleUrl: string;
  sections: SyncSectionPayload[];
}

export interface SyncSectionPayload {
  moodleSectionId: string;
  title: string;
  position: number;
  items: SyncItemPayload[];
}

export interface SyncItemPayload {
  type: 'file' | 'link' | 'assignment';
  name: string;
  moodleUrl: string;
  externalUrl?: string;
  fileSize?: number;
  mimeType?: string;
  // Assignment-specific fields (only present when type === 'assignment')
  moodleModuleId?: string;
  descriptionHtml?: string;
  dueDate?: string | null;
}

export interface SyncRequestPayload {
  instanceDomain: string;
  courses: SyncCoursePayload[];
}

// ============================================
// Sync API response types
// ============================================

export type FileStatus = 'exists' | 'new' | 'modified';

export interface SyncFileResult {
  moodleUrl: string;
  id: string;
  status: FileStatus;
}

export interface SyncAssignmentResult {
  moodleUrl: string;
  id: string;
  isNew: boolean;
  contentChanged: boolean;
}

export interface SyncSectionResult {
  moodleSectionId: string;
  id: string;
  items: SyncFileResult[];
  assignments: SyncAssignmentResult[];
}

export interface SyncCourseResult {
  moodleCourseId: string;
  id: string;
  sections: SyncSectionResult[];
}

export interface SyncResponsePayload {
  courses: SyncCourseResult[];
}

// ============================================
// Import types
// ============================================

export interface ImportRequestPayload {
  moodleCourseId: string;
  fileIds: string[];
  courseId?: string;
}

export interface ImportResponsePayload {
  syncId: string;
  importedCount: number;
}

// ============================================
// Status types
// ============================================

export interface CourseStatusPayload {
  lastSyncedAt: string | null;
  importedFileIds: string[];
  removedFileIds: string[];
  modifiedFileIds: string[];
}

// ============================================
// Dedup types
// ============================================

export interface DedupCheckResult {
  exists: boolean;
  fileId?: string;
  status: FileStatus;
}
