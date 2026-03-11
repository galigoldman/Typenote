# Contract: Moodle Sync API Routes

**Feature**: `004-moodle-import-sync` | **Date**: 2026-03-11

All routes require Supabase auth (session cookie). Shared registry writes use service role internally.

## POST /api/moodle/sync

Receive scraped course data from the web app. Upsert into the shared registry. Return what's new vs. already stored.

**Request body**:
```typescript
{
  instanceDomain: string;
  courses: Array<{
    moodleCourseId: string;
    name: string;
    moodleUrl: string;
    sections: Array<{
      moodleSectionId: string;
      title: string;
      position: number;
      items: Array<{
        type: "file" | "link";
        name: string;
        moodleUrl: string;
        externalUrl?: string;
        fileSize?: number;
        mimeType?: string;
      }>
    }>
  }>
}
```

**Response**:
```typescript
{
  courses: Array<{
    moodleCourseId: string;
    id: string; // our UUID
    sections: Array<{
      moodleSectionId: string;
      id: string; // our UUID
      items: Array<{
        moodleUrl: string;
        id: string; // our moodle_files UUID
        status: "exists" | "new" | "modified";
        // "exists" = already in registry (no upload needed)
        // "new" = not in registry (needs upload)
        // "modified" = URL exists but content may have changed
      }>
    }>
  }>
}
```

## POST /api/moodle/upload

Receive a file upload from the extension. Dedup check, store if new.

**Request**: `multipart/form-data`
- `file`: The file blob
- `sectionId`: UUID of the moodle_section
- `moodleUrl`: Original Moodle URL
- `fileName`: Display name
- `contentHash`: SHA-256 hex string (computed by extension)

**Response**:
```typescript
{
  fileId: string;           // moodle_files UUID
  deduplicated: boolean;    // true if hash matched existing file
  storagePath: string;      // path in Supabase Storage
}
```

## POST /api/moodle/import

Record that a student has imported specific files (creates user_file_imports records).

**Request body**:
```typescript
{
  moodleCourseId: string;  // our moodle_courses UUID
  fileIds: string[];        // array of moodle_files UUIDs
  courseId?: string;        // optional link to personal Typenote course
}
```

**Response**:
```typescript
{
  syncId: string;           // user_course_syncs UUID
  importedCount: number;
}
```

## GET /api/moodle/status?moodleCourseId={uuid}

Check what this student has already imported for a course.

**Response**:
```typescript
{
  lastSyncedAt: string | null;
  importedFileIds: string[];
  removedFileIds: string[];   // files flagged as removed from Moodle
}
```
