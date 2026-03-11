# Contract: Extension ↔ Web App Messaging Protocol

**Feature**: `004-moodle-import-sync` | **Date**: 2026-03-11

Communication between the Typenote web app and the Chrome extension uses `chrome.runtime.sendMessage` / `chrome.runtime.onMessageExternal`. All messages follow a request/response pattern.

## Message Format

All messages use a `type` discriminator:

```typescript
interface ExtensionMessage {
  type: string;
  payload?: unknown;
}

interface ExtensionResponse {
  success: boolean;
  data?: unknown;
  error?: string;
}
```

## Messages: Web App → Extension

### PING

Detect if extension is installed.

- **Request**: `{ type: "PING" }`
- **Response**: `{ success: true, data: { version: "1.0.0" } }`
- **On failure**: `chrome.runtime.lastError` (extension not installed)

### CHECK_LOGIN

Check if student is logged into their Moodle instance.

- **Request**: `{ type: "CHECK_LOGIN", payload: { moodleUrl: "https://moodle.tau.ac.il" } }`
- **Response (logged in)**: `{ success: true, data: { loggedIn: true } }`
- **Response (not logged in)**: `{ success: true, data: { loggedIn: false } }`
- **Response (error)**: `{ success: false, error: "Cannot reach Moodle" }`

### SCRAPE_COURSES

Scrape the list of enrolled courses from Moodle dashboard.

- **Request**: `{ type: "SCRAPE_COURSES", payload: { moodleUrl: "https://moodle.tau.ac.il" } }`
- **Response**:
  ```typescript
  {
    success: true,
    data: {
      courses: Array<{
        moodleCourseId: string;
        name: string;
        url: string;
      }>
    }
  }
  ```

### SCRAPE_COURSE_CONTENT

Scrape sections and files for a specific course.

- **Request**: `{ type: "SCRAPE_COURSE_CONTENT", payload: { courseUrl: "https://moodle.tau.ac.il/course/view.php?id=123" } }`
- **Response**:
  ```typescript
  {
    success: true,
    data: {
      sections: Array<{
        moodleSectionId: string;
        title: string;
        position: number;
        items: Array<{
          type: "file" | "link";
          name: string;
          moodleUrl: string;
          externalUrl?: string; // for links
          fileSize?: number;    // if available from DOM
          mimeType?: string;    // if inferable
        }>
      }>
    }
  }
  ```

### DOWNLOAD_AND_UPLOAD

Download a file from Moodle and upload it to the Typenote API.

- **Request**:
  ```typescript
  {
    type: "DOWNLOAD_AND_UPLOAD",
    payload: {
      moodleFileUrl: string;
      uploadEndpoint: string;  // Typenote API URL
      metadata: {
        sectionId: string;     // moodle_sections.id (already created)
        moodleUrl: string;
        fileName: string;
      }
    }
  }
  ```
- **Response**:
  ```typescript
  {
    success: true,
    data: {
      contentHash: string;     // SHA-256 computed by extension
      fileSize: number;
      mimeType: string;
      deduplicated: boolean;   // true if server said file already existed
    }
  }
  ```
- **Response (error)**: `{ success: false, error: "Download failed: 403 Forbidden" }`

### REQUEST_PERMISSION

Request host permission for a new Moodle domain.

- **Request**: `{ type: "REQUEST_PERMISSION", payload: { moodleUrl: "https://moodle.tau.ac.il" } }`
- **Response**: `{ success: true }` or `{ success: false, error: "User denied permission" }`
