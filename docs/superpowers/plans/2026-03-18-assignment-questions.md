# Assignment Questions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform Moodle assignments from opaque links into structured, browsable entities with AI-powered question splitting and a question browser panel for copying questions into homework documents.

**Architecture:** New `moodle_assignments` shared registry table + `assignment_splits` / `split_questions` tables. Extension scraper navigates to assignment pages to extract content. AI auto-splits on first sync. Question browser side panel (same pattern as AI chat panel) lets students copy questions into documents as non-editable context blocks via a new TipTap node extension.

**Tech Stack:** TypeScript 5, Next.js 16 (App Router), Supabase (PostgreSQL + RLS), Chrome Extension (Manifest V3), TipTap 3, Gemini AI (existing pipeline), Vitest

---

## File Structure

### New Files

| File | Responsibility |
| --- | --- |
| `supabase/migrations/00018_moodle_assignments.sql` | DB schema: `moodle_assignments`, `assignment_splits`, `split_questions` tables |
| `src/types/assignments.ts` | TypeScript interfaces for assignment entities |
| `src/lib/moodle/assignment-sync.ts` | Backend logic to upsert assignment data from sync payload |
| `src/lib/moodle/assignment-sync.test.ts` | Unit tests for assignment sync logic |
| `src/lib/ai/split-assignment.ts` | AI-powered question splitting (Gemini prompt + boundary parser) |
| `src/lib/ai/__tests__/split-assignment.test.ts` | Unit tests for splitting logic |
| `src/app/api/moodle/assignments/split/route.ts` | API route to trigger/retrieve AI splits |
| `src/app/api/moodle/assignments/splits/route.ts` | API route to list/create/update splits |
| `src/lib/editor/question-context-node.ts` | TipTap node extension for non-editable question context blocks |
| `src/lib/editor/question-context-node.test.ts` | Unit tests for the node extension |
| `src/components/assignments/question-browser-panel.tsx` | Side panel for browsing assignment questions |
| `src/components/assignments/question-browser-panel.test.tsx` | Tests for question browser panel |
| `src/components/assignments/split-editor.tsx` | UI for creating/editing question splits |
| `src/components/assignments/split-editor.test.tsx` | Tests for split editor |
| `src/components/assignments/question-context-block.tsx` | React component rendering the TipTap node view |
| `src/lib/moodle/assignment-images.ts` | Download authenticated Moodle images and rewrite src attributes |
| `src/lib/moodle/assignment-images.test.ts` | Tests for image downloading and URL rewriting |
| `src/app/api/moodle/assignments/split/route.test.ts` | Tests for AI split trigger route |
| `src/app/api/moodle/assignments/splits/route.test.ts` | Tests for splits CRUD route |
| `extension/src/content/assignment-scraper.ts` | Assignment-specific DOM scraping logic |

### Modified Files

| File | Change |
| --- | --- |
| `extension/src/content/moodle-scraper.ts` | Return `type: 'assignment'` instead of `type: 'link'` for assign activities |
| `extension/src/types/messages.ts` | Add `SCRAPE_ASSIGNMENT` message type and `ScrapedAssignment` data shape |
| `extension/src/background/service-worker.ts` | Add `SCRAPE_ASSIGNMENT` handler that navigates to assignment page |
| `src/types/database.ts` | Add `MoodleAssignment`, `AssignmentSplit`, `SplitQuestion` interfaces |
| `src/lib/moodle/sync-service.ts` | Handle assignment items in `upsertMoodleData`, add `flagRemovedAssignments` |
| `src/app/api/moodle/sync/route.ts` | Accept assignment data in sync payload |
| `src/types/moodle.ts` (or wherever `SyncItemPayload` is defined) | Add `'assignment'` to item type union + assignment fields |
| `src/lib/ai/prompts.ts` | Add `buildQuestionSplitPrompt` for assignment splitting |
| `src/components/editor/tiptap-editor.tsx` | Register question-context-node extension |
| `src/lib/actions/ai-context.ts` | Detect question context blocks and include in AI prompt |

---

## Task 1: Database Schema — Assignment Tables

**Files:**
- Create: `supabase/migrations/00018_moodle_assignments.sql`
- Modify: `src/types/database.ts`
- Create: `src/types/assignments.ts`
- Test: `src/types/database.test.ts`

- [ ] **Step 1: Write the migration SQL**

```sql
-- supabase/migrations/00018_moodle_assignments.sql

-- ============================================================
-- Shared assignment entity (same RLS pattern as moodle_files)
-- ============================================================
CREATE TABLE moodle_assignments (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  section_id    uuid NOT NULL REFERENCES moodle_sections(id) ON DELETE CASCADE,
  moodle_url    text NOT NULL,
  moodle_module_id text,
  title         text NOT NULL,
  description_html text NOT NULL DEFAULT '',
  due_date      timestamptz,
  is_removed    boolean NOT NULL DEFAULT false,
  content_version integer NOT NULL DEFAULT 1,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_moodle_assignments_section_url
  ON moodle_assignments (section_id, moodle_url);

ALTER TABLE moodle_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read assignments"
  ON moodle_assignments FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================
-- Shared question splits (lightweight boundary data)
-- ============================================================
CREATE TABLE assignment_splits (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  assignment_id   uuid NOT NULL REFERENCES moodle_assignments(id) ON DELETE CASCADE,
  creator_type    text NOT NULL CHECK (creator_type IN ('ai', 'student')),
  creator_id      uuid REFERENCES profiles(id) ON DELETE SET NULL,
  is_personal     boolean NOT NULL DEFAULT false,
  content_version integer NOT NULL DEFAULT 1,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_assignment_splits_assignment
  ON assignment_splits (assignment_id, created_at DESC);

ALTER TABLE assignment_splits ENABLE ROW LEVEL SECURITY;

-- Shared splits: everyone can read. Personal splits: only the creator.
CREATE POLICY "Read shared splits or own personal splits"
  ON assignment_splits FOR SELECT
  TO authenticated
  USING (
    is_personal = false
    OR creator_id = auth.uid()
  );

CREATE POLICY "Authenticated users can create splits"
  ON assignment_splits FOR INSERT
  TO authenticated
  WITH CHECK (creator_id = auth.uid() OR creator_type = 'ai');

CREATE POLICY "Creators can delete their own splits"
  ON assignment_splits FOR DELETE
  TO authenticated
  USING (creator_id = auth.uid());

-- ============================================================
-- Questions within a split (boundary positions)
-- ============================================================
CREATE TABLE split_questions (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  split_id        uuid NOT NULL REFERENCES assignment_splits(id) ON DELETE CASCADE,
  parent_id       uuid REFERENCES split_questions(id) ON DELETE SET NULL,
  label           text NOT NULL,
  position        integer NOT NULL DEFAULT 0,
  boundary_start  integer NOT NULL,
  boundary_end    integer NOT NULL,
  preamble_start  integer,
  preamble_end    integer,
  low_confidence  boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_split_questions_split
  ON split_questions (split_id, position);

ALTER TABLE split_questions ENABLE ROW LEVEL SECURITY;

-- Inherit visibility from parent split
CREATE POLICY "Read questions if can read parent split"
  ON split_questions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM assignment_splits s
      WHERE s.id = split_questions.split_id
        AND (s.is_personal = false OR s.creator_id = auth.uid())
    )
  );

CREATE POLICY "Insert questions for own splits"
  ON split_questions FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM assignment_splits s
      WHERE s.id = split_questions.split_id
        AND (s.creator_id = auth.uid() OR s.creator_type = 'ai')
    )
  );

CREATE POLICY "Delete questions for own splits"
  ON split_questions FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM assignment_splits s
      WHERE s.id = split_questions.split_id
        AND s.creator_id = auth.uid()
    )
  );
```

- [ ] **Step 2: Add TypeScript interfaces**

Add to `src/types/database.ts`:

```typescript
export interface MoodleAssignment {
  id: string;
  section_id: string;
  moodle_url: string;
  moodle_module_id: string | null;
  title: string;
  description_html: string;
  due_date: string | null;
  is_removed: boolean;
  content_version: number;
  created_at: string;
  updated_at: string;
}

export interface AssignmentSplit {
  id: string;
  assignment_id: string;
  creator_type: 'ai' | 'student';
  creator_id: string | null;
  is_personal: boolean;
  content_version: number;
  created_at: string;
}

export interface SplitQuestion {
  id: string;
  split_id: string;
  parent_id: string | null;
  label: string;
  position: number;
  boundary_start: number;
  boundary_end: number;
  preamble_start: number | null;
  preamble_end: number | null;
  low_confidence: boolean;
  created_at: string;
}
```

- [ ] **Step 3: Create the assignments types file**

Create `src/types/assignments.ts`:

```typescript
import type { MoodleAssignment, AssignmentSplit, SplitQuestion } from './database';

/** An assignment with its available splits loaded */
export interface AssignmentWithSplits extends MoodleAssignment {
  splits: AssignmentSplit[];
}

/** A split with its questions loaded */
export interface SplitWithQuestions extends AssignmentSplit {
  questions: SplitQuestion[];
}

/** Boundary definition for creating/editing splits */
export interface QuestionBoundary {
  label: string;
  position: number;
  boundaryStart: number;
  boundaryEnd: number;
  parentLabel?: string;
  preambleStart?: number;
  preambleEnd?: number;
  lowConfidence?: boolean;
}

/** Result from AI split */
export interface AiSplitResult {
  questions: QuestionBoundary[];
  contentVersion: number;
}

/** Scraped assignment data from the extension */
export interface ScrapedAssignment {
  moodleUrl: string;
  moodleModuleId: string;
  title: string;
  descriptionHtml: string;
  dueDate: string | null;
}
```

- [ ] **Step 4: Add type assertion test**

Add to `src/types/database.test.ts`:

```typescript
it('MoodleAssignment interface has required fields', () => {
  const assignment: MoodleAssignment = {
    id: 'test',
    section_id: 'section-1',
    moodle_url: 'https://moodle.example.com/mod/assign/view.php?id=1',
    moodle_module_id: '1',
    title: 'Homework 1',
    description_html: '<p>Question 1...</p>',
    due_date: '2026-04-01T23:59:00Z',
    is_removed: false,
    content_version: 1,
    created_at: '2026-03-18T00:00:00Z',
    updated_at: '2026-03-18T00:00:00Z',
  };
  expect(assignment.id).toBe('test');
});
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/types/database.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/00018_moodle_assignments.sql src/types/database.ts src/types/assignments.ts src/types/database.test.ts
git commit -m "feat(db): add moodle_assignments, assignment_splits, split_questions tables"
```

---

## Task 2: Extension — Assignment Scraping

**Files:**
- Modify: `extension/src/types/messages.ts`
- Modify: `extension/src/content/moodle-scraper.ts`
- Create: `extension/src/content/assignment-scraper.ts`
- Modify: `extension/src/background/service-worker.ts`

- [ ] **Step 1: Add message types**

In `extension/src/types/messages.ts`, add the new request/response types:

```typescript
// Add to the Request union type:
export interface ScrapeAssignmentRequest {
  type: 'SCRAPE_ASSIGNMENT';
  payload: {
    assignmentUrl: string;
  };
}

// Add to response data types:
export interface ScrapedAssignmentData {
  title: string;
  descriptionHtml: string;
  dueDate: string | null;
  moodleModuleId: string;
}
```

Update `ExtensionRequest` union to include `ScrapeAssignmentRequest`.
Update `ResponseDataMap` to map `'SCRAPE_ASSIGNMENT'` to `ScrapedAssignmentData`.

- [ ] **Step 2: Update moodle-scraper to return assignment type**

In `extension/src/content/moodle-scraper.ts`, modify the `parseActivity` function. Replace the assignment-as-link block (lines ~233-241):

```typescript
// OLD:
if (baseModType === 'assign' || moodleUrl.includes('/mod/assign/')) {
  return {
    type: 'link',
    name,
    moodleUrl,
    externalUrl: moodleUrl,
  };
}

// NEW:
if (baseModType === 'assign' || moodleUrl.includes('/mod/assign/')) {
  return {
    type: 'assignment' as const,
    name,
    moodleUrl,
    externalUrl: moodleUrl,
  };
}
```

Update the `ScrapedItem` type in `messages.ts` to support `type: 'file' | 'link' | 'assignment'`.

- [ ] **Step 3: Create assignment scraper**

Create `extension/src/content/assignment-scraper.ts`:

```typescript
/**
 * Scrapes a Moodle assignment page for its full content.
 * Injected into the assignment page tab by the service worker.
 */
export function scrapeAssignmentPage(): {
  title: string;
  descriptionHtml: string;
  dueDate: string | null;
  moodleModuleId: string;
} {
  // Title: from page header or activity name
  const title =
    document.querySelector('.page-header-headings h2')?.textContent?.trim() ??
    document.querySelector('[data-activityname]')?.getAttribute('data-activityname') ??
    document.title.replace(/ \|.*$/, '').trim();

  // Description: the main assignment intro/description area
  const descriptionEl =
    document.querySelector('.activity-description .no-overflow') ??
    document.querySelector('#intro') ??
    document.querySelector('.submissionstatustable')?.previousElementSibling;

  const descriptionHtml = descriptionEl?.innerHTML?.trim() ?? '';

  // Due date: from the submission status table
  let dueDate: string | null = null;
  const rows = document.querySelectorAll('.submissionstatustable tr');
  for (const row of rows) {
    const header = row.querySelector('td.cell.c0')?.textContent?.trim();
    if (header === 'Due date' || header === 'תאריך הגשה') {
      const dateText = row.querySelector('td.cell.c1')?.textContent?.trim();
      if (dateText) {
        const parsed = new Date(dateText);
        dueDate = isNaN(parsed.getTime()) ? null : parsed.toISOString();
      }
    }
  }

  // Module ID: from URL parameter or page data
  const urlParams = new URLSearchParams(window.location.search);
  const moodleModuleId = urlParams.get('id') ?? '';

  return { title, descriptionHtml, dueDate, moodleModuleId };
}

// Expose for service worker injection
(window as Record<string, unknown>).__typenote_assignment_scraper = scrapeAssignmentPage;
```

- [ ] **Step 4: Add service worker handler**

In `extension/src/background/service-worker.ts`, add a handler for `SCRAPE_ASSIGNMENT` in the message switch. Pattern follows the existing `SCRAPE_COURSE_CONTENT` handler:

```typescript
case 'SCRAPE_ASSIGNMENT': {
  const { assignmentUrl } = message.payload;
  const tab = await getOrCreateMoodleTab(new URL(assignmentUrl).origin);
  await chrome.tabs.update(tab.id!, { url: assignmentUrl });
  await waitForTabLoad(tab.id!);

  // Inject the assignment scraper
  const [result] = await chrome.scripting.executeScript({
    target: { tabId: tab.id! },
    files: ['content/assignment-scraper.js'],
  });

  const [scraped] = await chrome.scripting.executeScript({
    target: { tabId: tab.id! },
    func: () => (window as any).__typenote_assignment_scraper(),
  });

  return { success: true, data: scraped.result };
}
```

- [ ] **Step 5: Write tests for assignment scraper**

The assignment scraper is a pure DOM function. Test it by creating a mock DOM structure and verifying extraction. Create a test file alongside it (or in the extension's test directory if one exists):

```typescript
// Test scrapeAssignmentPage with jsdom
import { describe, it, expect } from 'vitest';

describe('scrapeAssignmentPage', () => {
  it('extracts title from page header', () => {
    document.body.innerHTML = `
      <div class="page-header-headings"><h2>Homework 3</h2></div>
      <div class="activity-description"><div class="no-overflow"><p>Q1: Solve x=1</p></div></div>
    `;
    // Import and call scrapeAssignmentPage, verify title === 'Homework 3'
  });

  it('extracts due date from submission status table', () => {
    document.body.innerHTML = `
      <table class="submissionstatustable"><tr>
        <td class="cell c0">Due date</td>
        <td class="cell c1">1 April 2026, 11:59 PM</td>
      </tr></table>
    `;
    // Verify dueDate is parsed to ISO string
  });

  it('returns empty description when no description area found', () => {
    document.body.innerHTML = '<div></div>';
    // Verify descriptionHtml === ''
  });
});
```

- [ ] **Step 6: Commit**

```bash
git add extension/src/types/messages.ts extension/src/content/moodle-scraper.ts extension/src/content/assignment-scraper.ts extension/src/background/service-worker.ts
git commit -m "feat(extension): scrape full assignment content from Moodle pages"
```

---

## Task 3: Backend — Assignment Sync Service

**Files:**
- Create: `src/lib/moodle/assignment-sync.ts`
- Create: `src/lib/moodle/assignment-sync.test.ts`
- Modify: `src/lib/moodle/sync-service.ts`
- Modify: `src/app/api/moodle/sync/route.ts`

- [ ] **Step 1: Write the failing test for assignment upsert**

Create `src/lib/moodle/assignment-sync.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { upsertAssignment } from './assignment-sync';

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}));

import { createAdminClient } from '@/lib/supabase/admin';
const mockCreateAdminClient = createAdminClient as ReturnType<typeof vi.fn>;

function createMockAdmin(singleResults: Array<{ data: unknown; error?: unknown }>) {
  let callIndex = 0;
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.from = vi.fn().mockReturnValue(chain);
  chain.select = vi.fn().mockReturnValue(chain);
  chain.insert = vi.fn().mockReturnValue(chain);
  chain.upsert = vi.fn().mockReturnValue(chain);
  chain.update = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.single = vi.fn().mockImplementation(() => {
    const result = singleResults[callIndex] ?? { data: null };
    callIndex++;
    return Promise.resolve(result);
  });
  return chain;
}

describe('upsertAssignment', () => {
  it('creates a new assignment when none exists', async () => {
    const mock = createMockAdmin([
      { data: null },  // SELECT returns no existing
      { data: { id: 'new-id', content_version: 1 } },  // INSERT returns new
    ]);
    mockCreateAdminClient.mockReturnValue(mock);

    const result = await upsertAssignment({
      sectionId: 'section-1',
      moodleUrl: 'https://moodle.example.com/mod/assign/view.php?id=1',
      moodleModuleId: '1',
      title: 'Homework 1',
      descriptionHtml: '<p>Q1: Solve...</p>',
      dueDate: '2026-04-01T23:59:00Z',
    });

    expect(result.assignmentId).toBe('new-id');
    expect(result.isNew).toBe(true);
  });

  it('updates existing assignment when description changed', async () => {
    const mock = createMockAdmin([
      { data: { id: 'existing-id', description_html: '<p>Old</p>', content_version: 1 } },
      { data: { id: 'existing-id', content_version: 2 } },  // UPDATE returns updated
    ]);
    mockCreateAdminClient.mockReturnValue(mock);

    const result = await upsertAssignment({
      sectionId: 'section-1',
      moodleUrl: 'https://moodle.example.com/mod/assign/view.php?id=1',
      moodleModuleId: '1',
      title: 'Homework 1',
      descriptionHtml: '<p>New content</p>',
      dueDate: null,
    });

    expect(result.assignmentId).toBe('existing-id');
    expect(result.isNew).toBe(false);
    expect(result.contentChanged).toBe(true);
  });

  it('skips update when content has not changed', async () => {
    const html = '<p>Same content</p>';
    const mock = createMockAdmin([
      { data: { id: 'existing-id', description_html: html, content_version: 1 } },
    ]);
    mockCreateAdminClient.mockReturnValue(mock);

    const result = await upsertAssignment({
      sectionId: 'section-1',
      moodleUrl: 'https://moodle.example.com/mod/assign/view.php?id=1',
      moodleModuleId: '1',
      title: 'Homework 1',
      descriptionHtml: html,
      dueDate: null,
    });

    expect(result.assignmentId).toBe('existing-id');
    expect(result.contentChanged).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/moodle/assignment-sync.test.ts`
Expected: FAIL — module `./assignment-sync` not found

- [ ] **Step 3: Implement assignment-sync.ts**

Create `src/lib/moodle/assignment-sync.ts`:

```typescript
import { createAdminClient } from '@/lib/supabase/admin';

interface UpsertAssignmentParams {
  sectionId: string;
  moodleUrl: string;
  moodleModuleId: string;
  title: string;
  descriptionHtml: string;
  dueDate: string | null;
}

interface UpsertAssignmentResult {
  assignmentId: string;
  isNew: boolean;
  contentChanged: boolean;
}

export async function upsertAssignment(
  params: UpsertAssignmentParams,
): Promise<UpsertAssignmentResult> {
  const admin = createAdminClient();

  // Check if assignment already exists
  const { data: existing } = await admin
    .from('moodle_assignments')
    .select('id, description_html, content_version')
    .eq('section_id', params.sectionId)
    .eq('moodle_url', params.moodleUrl)
    .single();

  if (!existing) {
    // Create new
    const { data: created } = await admin
      .from('moodle_assignments')
      .insert({
        section_id: params.sectionId,
        moodle_url: params.moodleUrl,
        moodle_module_id: params.moodleModuleId,
        title: params.title,
        description_html: params.descriptionHtml,
        due_date: params.dueDate,
        is_removed: false,
      })
      .select('id, content_version')
      .single();

    return {
      assignmentId: created!.id,
      isNew: true,
      contentChanged: false,
    };
  }

  // Check if content changed
  const contentChanged = existing.description_html !== params.descriptionHtml;

  if (contentChanged) {
    const { data: updated } = await admin
      .from('moodle_assignments')
      .update({
        title: params.title,
        description_html: params.descriptionHtml,
        due_date: params.dueDate,
        content_version: existing.content_version + 1,
        is_removed: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .select('id, content_version')
      .single();

    return {
      assignmentId: updated!.id,
      isNew: false,
      contentChanged: true,
    };
  }

  // No change — just update metadata (title, due_date) if needed
  return {
    assignmentId: existing.id,
    isNew: false,
    contentChanged: false,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/moodle/assignment-sync.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Update SyncItemPayload type**

Before integrating with sync-service, update the `ScrapedItem` / `SyncItemPayload` type (in `extension/src/types/messages.ts` and any corresponding server-side type) to support assignments:

```typescript
// ScrapedItem type: add 'assignment' to the union
export interface ScrapedItem {
  type: 'file' | 'link' | 'assignment';
  name: string;
  moodleUrl: string;
  externalUrl?: string;
  fileSize?: number;
  mimeType?: string;
  // Assignment-specific fields (only when type === 'assignment'):
  descriptionHtml?: string;
  dueDate?: string | null;
  moodleModuleId?: string;
}
```

- [ ] **Step 6: Integrate with sync-service.ts**

In `src/lib/moodle/sync-service.ts`, in the `upsertMoodleData` function where it iterates over section items, add handling for `type: 'assignment'` items. **Before** the existing file/link processing:

```typescript
// Declare at function scope alongside fileResults:
const assignmentResults: UpsertAssignmentResult[] = [];

// Inside the items loop, BEFORE file/link handling:
if (item.type === 'assignment') {
  const result = await upsertAssignment({
    sectionId: sectionRecord.id,
    moodleUrl: item.moodleUrl,
    moodleModuleId: item.moodleModuleId ?? '',
    title: item.name,
    descriptionHtml: item.descriptionHtml ?? '',
    dueDate: item.dueDate ?? null,
  });
  assignmentResults.push(result);
  continue; // Don't process as file/link
}
```

Include `assignmentResults` in the `SyncResponsePayload` return value.

- [ ] **Step 7: Add flagRemovedAssignments function**

In `src/lib/moodle/assignment-sync.ts`, add a function to soft-delete removed assignments (mirrors `flagRemovedFiles` pattern):

```typescript
export async function flagRemovedAssignments(
  sectionId: string,
  currentMoodleUrls: string[],
): Promise<void> {
  const admin = createAdminClient();

  // Find assignments in this section not in the current URL set
  const { data: existing } = await admin
    .from('moodle_assignments')
    .select('id, moodle_url')
    .eq('section_id', sectionId)
    .eq('is_removed', false);

  if (!existing) return;

  const removedIds = existing
    .filter((a) => !currentMoodleUrls.includes(a.moodle_url))
    .map((a) => a.id);

  if (removedIds.length === 0) return;

  await admin
    .from('moodle_assignments')
    .update({ is_removed: true, updated_at: new Date().toISOString() })
    .in('id', removedIds);
}
```

Call this from `detectChanges` or `upsertMoodleData` after processing all section items.

- [ ] **Step 8: Update sync API route**

In `src/app/api/moodle/sync/route.ts`, ensure the payload type accepts `ScrapedItem` with `type: 'assignment'` and passes through the assignment-specific fields.

- [ ] **Step 7: Run full sync test suite**

Run: `npx vitest run src/lib/moodle/`
Expected: All existing + new tests PASS

- [ ] **Step 8: Commit**

```bash
git add src/lib/moodle/assignment-sync.ts src/lib/moodle/assignment-sync.test.ts src/lib/moodle/sync-service.ts src/app/api/moodle/sync/route.ts
git commit -m "feat(sync): handle assignment items in Moodle sync pipeline"
```

---

## Task 4: AI — Question Splitting Prompt & Logic

**Files:**
- Create: `src/lib/ai/split-assignment.ts`
- Create: `src/lib/ai/__tests__/split-assignment.test.ts`
- Modify: `src/lib/ai/prompts.ts`
- Modify: `src/lib/ai/__tests__/prompts.test.ts`

- [ ] **Step 1: Write failing test for the split prompt builder**

Add to `src/lib/ai/__tests__/prompts.test.ts`:

```typescript
import { buildQuestionSplitPrompt } from '../prompts';

describe('buildQuestionSplitPrompt', () => {
  it('produces a prompt that instructs the AI to return JSON boundaries', () => {
    const prompt = buildQuestionSplitPrompt('<p>1. Solve x+2=5</p><p>2. Find the derivative</p>');
    expect(prompt).toContain('boundary_start');
    expect(prompt).toContain('boundary_end');
    expect(prompt).toContain('JSON');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/ai/__tests__/prompts.test.ts`
Expected: FAIL — `buildQuestionSplitPrompt` not exported

- [ ] **Step 3: Implement the prompt builder**

Add to `src/lib/ai/prompts.ts`:

```typescript
export function buildQuestionSplitPrompt(descriptionHtml: string): string {
  return `You are a precise text parser. Analyze the following assignment description HTML and identify individual questions.

For each question, return its boundary positions (character offsets within the HTML string), a label, and whether it's a subquestion.

IMPORTANT:
- Boundaries MUST align to complete HTML element boundaries (opening/closing tags of <p>, <li>, <tr>, <div>, etc.)
- Never split mid-element
- Preserve shared preamble/context text by including preamble boundaries for questions that share context
- If no clear question structure exists, return a single question spanning the entire text
- Flag boundaries where you are uncertain with "low_confidence": true

Return ONLY valid JSON in this exact format:
{
  "questions": [
    {
      "label": "1",
      "position": 0,
      "boundary_start": 0,
      "boundary_end": 42,
      "parent_label": null,
      "preamble_start": null,
      "preamble_end": null,
      "low_confidence": false
    }
  ]
}

Assignment HTML:
${descriptionHtml}`;
}
```

- [ ] **Step 4: Run prompt tests**

Run: `npx vitest run src/lib/ai/__tests__/prompts.test.ts`
Expected: PASS

- [ ] **Step 5: Write failing test for splitAssignment function**

Create `src/lib/ai/__tests__/split-assignment.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { parseAiSplitResponse, snapBoundariesToElements } from '../split-assignment';

describe('parseAiSplitResponse', () => {
  it('parses valid AI JSON response into QuestionBoundary array', () => {
    const aiResponse = JSON.stringify({
      questions: [
        { label: '1', position: 0, boundary_start: 0, boundary_end: 30, parent_label: null, preamble_start: null, preamble_end: null, low_confidence: false },
        { label: '2', position: 1, boundary_start: 30, boundary_end: 60, parent_label: null, preamble_start: null, preamble_end: null, low_confidence: false },
      ],
    });

    const result = parseAiSplitResponse(aiResponse);
    expect(result).toHaveLength(2);
    expect(result[0].label).toBe('1');
    expect(result[0].boundaryStart).toBe(0);
    expect(result[1].label).toBe('2');
  });

  it('handles subquestions with parent references', () => {
    const aiResponse = JSON.stringify({
      questions: [
        { label: '1', position: 0, boundary_start: 0, boundary_end: 20, parent_label: null, preamble_start: null, preamble_end: null, low_confidence: false },
        { label: '1a', position: 1, boundary_start: 20, boundary_end: 40, parent_label: '1', preamble_start: null, preamble_end: null, low_confidence: false },
        { label: '1b', position: 2, boundary_start: 40, boundary_end: 60, parent_label: '1', preamble_start: null, preamble_end: null, low_confidence: false },
      ],
    });

    const result = parseAiSplitResponse(aiResponse);
    expect(result).toHaveLength(3);
    expect(result[1].parentLabel).toBe('1');
  });

  it('returns single question when AI response is unparseable', () => {
    const result = parseAiSplitResponse('invalid json garbage');
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe('1');
    expect(result[0].boundaryStart).toBe(0);
  });
});

describe('snapBoundariesToElements', () => {
  it('snaps boundary positions to nearest closing tag boundary', () => {
    const html = '<p>Question 1</p><p>Question 2</p>';
    //            0              17              34
    const boundaries = [
      { label: '1', position: 0, boundaryStart: 0, boundaryEnd: 15 }, // mid-tag
    ];
    const snapped = snapBoundariesToElements(boundaries, html);
    expect(snapped[0].boundaryEnd).toBe(17); // snaps to after </p>
  });

  it('preserves boundaries already on element boundaries', () => {
    const html = '<p>Q1</p><p>Q2</p>';
    const boundaries = [
      { label: '1', position: 0, boundaryStart: 0, boundaryEnd: 9 },
    ];
    const snapped = snapBoundariesToElements(boundaries, html);
    expect(snapped[0].boundaryEnd).toBe(9);
  });
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `npx vitest run src/lib/ai/__tests__/split-assignment.test.ts`
Expected: FAIL — module not found

- [ ] **Step 7: Implement split-assignment.ts**

Create `src/lib/ai/split-assignment.ts`:

```typescript
import type { QuestionBoundary } from '@/types/assignments';
import { buildQuestionSplitPrompt } from './prompts';

/**
 * Parse the AI's JSON response into structured QuestionBoundary objects.
 * Falls back to a single question spanning the full text on parse failure.
 */
export function parseAiSplitResponse(
  aiResponse: string,
  htmlLength?: number,
): QuestionBoundary[] {
  try {
    // Extract JSON from response (AI may wrap in markdown code blocks)
    const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found');

    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed.questions) || parsed.questions.length === 0) {
      throw new Error('No questions array');
    }

    return parsed.questions.map((q: Record<string, unknown>, i: number) => ({
      label: String(q.label ?? `${i + 1}`),
      position: Number(q.position ?? i),
      boundaryStart: Number(q.boundary_start ?? 0),
      boundaryEnd: Number(q.boundary_end ?? 0),
      parentLabel: q.parent_label ? String(q.parent_label) : undefined,
      preambleStart: q.preamble_start != null ? Number(q.preamble_start) : undefined,
      preambleEnd: q.preamble_end != null ? Number(q.preamble_end) : undefined,
      lowConfidence: Boolean(q.low_confidence),
    }));
  } catch {
    // Fallback: single question spanning entire text
    return [{
      label: '1',
      position: 0,
      boundaryStart: 0,
      boundaryEnd: htmlLength ?? 0,
      lowConfidence: true,
    }];
  }
}

/**
 * Request an AI-powered question split for an assignment.
 * Uses the existing Gemini pipeline.
 */
export async function splitAssignmentWithAi(
  descriptionHtml: string,
): Promise<QuestionBoundary[]> {
  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_AI_API_KEY! });

  const prompt = buildQuestionSplitPrompt(descriptionHtml);

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: prompt,
  });

  const text = response.text ?? '';
  const boundaries = parseAiSplitResponse(text, descriptionHtml.length);
  // Server-side validation: snap boundaries to HTML element boundaries
  return snapBoundariesToElements(boundaries, descriptionHtml);
}

/**
 * Snap boundary positions to the nearest complete HTML element boundary.
 * Uses a proper tag-aware approach rather than naive character search.
 */
export function snapBoundariesToElements(
  boundaries: QuestionBoundary[],
  html: string,
): QuestionBoundary[] {
  // Find all top-level element boundaries (positions right after closing tags)
  const validPositions = [0]; // Start of string is always valid
  const tagRegex = /<\/[a-z][a-z0-9]*>/gi;
  let match;
  while ((match = tagRegex.exec(html)) !== null) {
    validPositions.push(match.index + match[0].length);
  }
  validPositions.push(html.length);

  const snap = (pos: number): number => {
    let closest = validPositions[0];
    for (const vp of validPositions) {
      if (Math.abs(vp - pos) < Math.abs(closest - pos)) closest = vp;
    }
    return closest;
  };

  return boundaries.map((b) => ({
    ...b,
    boundaryStart: snap(b.boundaryStart),
    boundaryEnd: snap(b.boundaryEnd),
    preambleStart: b.preambleStart != null ? snap(b.preambleStart) : undefined,
    preambleEnd: b.preambleEnd != null ? snap(b.preambleEnd) : undefined,
  }));
}
```

- [ ] **Step 8: Run tests**

Run: `npx vitest run src/lib/ai/__tests__/split-assignment.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 9: Commit**

```bash
git add src/lib/ai/split-assignment.ts src/lib/ai/__tests__/split-assignment.test.ts src/lib/ai/prompts.ts src/lib/ai/__tests__/prompts.test.ts
git commit -m "feat(ai): add question splitting prompt and parser for assignments"
```

---

## Task 5: API Routes — Split Management

**Files:**
- Create: `src/app/api/moodle/assignments/split/route.ts`
- Create: `src/app/api/moodle/assignments/splits/route.ts`

- [ ] **Step 1: Create the AI split trigger route**

Create `src/app/api/moodle/assignments/split/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { splitAssignmentWithAi, parseAiSplitResponse } from '@/lib/ai/split-assignment';

/**
 * POST /api/moodle/assignments/split
 * Triggers AI splitting for an assignment. Creates a shared AI split.
 * Body: { assignmentId: string }
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { assignmentId } = await req.json();
  if (!assignmentId) {
    return NextResponse.json({ error: 'assignmentId required' }, { status: 400 });
  }

  const admin = createAdminClient();

  // Fetch assignment
  const { data: assignment } = await admin
    .from('moodle_assignments')
    .select('id, description_html, content_version')
    .eq('id', assignmentId)
    .single();

  if (!assignment) {
    return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });
  }

  // Use existing rate limit helper (atomic check-and-increment, avoids TOCTOU race)
  const { checkAndIncrementUsage } = await import('@/lib/ai/rate-limit');
  const allowed = await checkAndIncrementUsage(user.id, 'flash');
  if (!allowed) {
    return NextResponse.json({ error: 'AI quota exhausted', deferred: true }, { status: 429 });
  }

  // Run AI split
  const boundaries = await splitAssignmentWithAi(assignment.description_html);

  // Save as shared AI split
  const { data: split } = await admin
    .from('assignment_splits')
    .insert({
      assignment_id: assignmentId,
      creator_type: 'ai',
      creator_id: null,
      is_personal: false,
      content_version: assignment.content_version,
    })
    .select('id')
    .single();

  // Insert questions
  const questions = boundaries.map((b) => ({
    split_id: split!.id,
    label: b.label,
    position: b.position,
    boundary_start: b.boundaryStart,
    boundary_end: b.boundaryEnd,
    preamble_start: b.preambleStart ?? null,
    preamble_end: b.preambleEnd ?? null,
    parent_id: null, // Resolved in a second pass if needed
    low_confidence: b.lowConfidence ?? false,
  }));

  await admin.from('split_questions').insert(questions);

  return NextResponse.json({ splitId: split!.id, questionCount: boundaries.length });
}
```

- [ ] **Step 2: Create the splits CRUD route**

Create `src/app/api/moodle/assignments/splits/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * GET /api/moodle/assignments/splits?assignmentId=xxx
 * Lists all available splits for an assignment (shared + user's personal).
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const assignmentId = req.nextUrl.searchParams.get('assignmentId');
  if (!assignmentId) {
    return NextResponse.json({ error: 'assignmentId required' }, { status: 400 });
  }

  // RLS handles visibility (shared + own personal)
  const { data: splits } = await supabase
    .from('assignment_splits')
    .select('*, split_questions(*)')
    .eq('assignment_id', assignmentId)
    .order('created_at', { ascending: false });

  return NextResponse.json({ splits: splits ?? [] });
}

/**
 * POST /api/moodle/assignments/splits
 * Creates a new student split (shared or personal).
 * Body: { assignmentId, questions: QuestionBoundary[], isPersonal: boolean }
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { assignmentId, questions, isPersonal } = await req.json();

  const admin = createAdminClient();

  // Get assignment content_version
  const { data: assignment } = await admin
    .from('moodle_assignments')
    .select('content_version')
    .eq('id', assignmentId)
    .single();

  if (!assignment) {
    return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });
  }

  // If personal, delete existing personal split for this user+assignment
  if (isPersonal) {
    const { data: existing } = await supabase
      .from('assignment_splits')
      .select('id')
      .eq('assignment_id', assignmentId)
      .eq('creator_id', user.id)
      .eq('is_personal', true)
      .single();

    if (existing) {
      // Use user-scoped client — RLS ensures only creator can delete their own splits
      await supabase.from('assignment_splits').delete().eq('id', existing.id);
    }
  }

  // Create split
  const { data: split } = await admin
    .from('assignment_splits')
    .insert({
      assignment_id: assignmentId,
      creator_type: 'student',
      creator_id: user.id,
      is_personal: isPersonal,
      content_version: assignment.content_version,
    })
    .select('id')
    .single();

  // Insert questions
  const questionRows = questions.map((q: Record<string, unknown>, i: number) => ({
    split_id: split!.id,
    label: String(q.label ?? `${i + 1}`),
    position: Number(q.position ?? i),
    boundary_start: Number(q.boundaryStart),
    boundary_end: Number(q.boundaryEnd),
    preamble_start: q.preambleStart ?? null,
    preamble_end: q.preambleEnd ?? null,
    low_confidence: Boolean(q.lowConfidence),
  }));

  await admin.from('split_questions').insert(questionRows);

  return NextResponse.json({ splitId: split!.id, questionCount: questionRows.length });
}
```

- [ ] **Step 3: Add deferred split logic to question browser**

In the GET handler of `src/app/api/moodle/assignments/splits/route.ts`, add logic to detect assignments with no AI split and trigger one lazily:

```typescript
// After fetching splits, check if assignment has no AI split
const hasAiSplit = splits?.some((s) => s.creator_type === 'ai');
if (!hasAiSplit) {
  // Attempt deferred AI split for this user (may fail if quota exhausted — that's OK)
  try {
    const { checkAndIncrementUsage } = await import('@/lib/ai/rate-limit');
    const allowed = await checkAndIncrementUsage(user.id, 'flash');
    if (allowed) {
      const { splitAssignmentWithAi } = await import('@/lib/ai/split-assignment');
      const { data: assignment } = await admin
        .from('moodle_assignments')
        .select('description_html, content_version')
        .eq('id', assignmentId)
        .single();

      if (assignment) {
        const boundaries = await splitAssignmentWithAi(assignment.description_html);
        // Save as AI split (same logic as POST /split route)
        // ... insert split and questions, then re-fetch splits for response
      }
    }
  } catch {
    // Deferred split failed — return empty splits, next user may succeed
  }
}
```

- [ ] **Step 4: Write API route tests**

Create `src/app/api/moodle/assignments/split/route.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';

// Mock dependencies
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}));
vi.mock('@/lib/ai/rate-limit', () => ({
  checkAndIncrementUsage: vi.fn(),
}));
vi.mock('@/lib/ai/split-assignment', () => ({
  splitAssignmentWithAi: vi.fn(),
}));

describe('POST /api/moodle/assignments/split', () => {
  it('returns 401 when not authenticated', async () => {
    // Mock supabase.auth.getUser() returning null
    // Call POST handler, expect 401
  });

  it('returns 429 when AI quota exhausted', async () => {
    // Mock checkAndIncrementUsage returning false
    // Call POST handler, expect 429 with deferred: true
  });

  it('creates AI split and returns splitId on success', async () => {
    // Mock checkAndIncrementUsage returning true
    // Mock splitAssignmentWithAi returning boundaries
    // Mock admin inserts returning split with id
    // Call POST handler, expect 200 with splitId and questionCount
  });
});
```

- [ ] **Step 5: Commit**

```bash
git add src/app/api/moodle/assignments/split/route.ts src/app/api/moodle/assignments/split/route.test.ts src/app/api/moodle/assignments/splits/route.ts src/app/api/moodle/assignments/splits/route.test.ts
git commit -m "feat(api): add assignment split trigger and CRUD routes with deferred splitting"
```

---

## Task 6: TipTap — Question Context Block Node Extension

**Files:**
- Create: `src/lib/editor/question-context-node.ts`
- Create: `src/lib/editor/question-context-node.test.ts`
- Create: `src/components/assignments/question-context-block.tsx`
- Modify: `src/components/editor/tiptap-editor.tsx`

- [ ] **Step 1: Write failing test for the node extension**

Create `src/lib/editor/question-context-node.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { QuestionContextNode } from './question-context-node';

describe('QuestionContextNode', () => {
  it('defines a node with name "questionContext"', () => {
    expect(QuestionContextNode.name).toBe('questionContext');
  });

  it('is an atom node (non-editable content)', () => {
    // TipTap stores config in extensionConfig after Node.create()
    // Access via the extension's spec or options
    expect(QuestionContextNode.config.atom).toBe(true);
  });

  it('belongs to the block group', () => {
    expect(QuestionContextNode.config.group).toBe('block');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/editor/question-context-node.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement the node extension**

Create `src/lib/editor/question-context-node.ts`:

```typescript
import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';

export const QuestionContextNode = Node.create({
  name: 'questionContext',
  group: 'block',
  atom: true,
  draggable: false,
  editable: false,

  addAttributes() {
    return {
      label: { default: '' },
      html: { default: '' },
      preambleHtml: { default: null },
      assignmentId: { default: null },
      splitId: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-question-context]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-question-context': '' }), 0];
  },

  // Note: addNodeView is set up separately in the editor file where the component
  // can be imported directly (the editor is always client-side).
  // See tiptap-editor.tsx integration step below.
});
```

- [ ] **Step 4: Create the React node view component**

Create `src/components/assignments/question-context-block.tsx`:

```typescript
'use client';

import { NodeViewWrapper } from '@tiptap/react';

export function QuestionContextBlockView({ node, deleteNode }: {
  node: { attrs: { label: string; html: string; preambleHtml: string | null } };
  deleteNode: () => void;
}) {
  return (
    <NodeViewWrapper>
      <div
        className="my-3 rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950 p-4 relative"
        contentEditable={false}
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wide">
            Question {node.attrs.label}
          </span>
          <button
            onClick={deleteNode}
            className="text-xs text-muted-foreground hover:text-destructive"
            title="Remove question block"
          >
            &times;
          </button>
        </div>
        {node.attrs.preambleHtml && (
          <div
            className="text-sm text-muted-foreground mb-2 pb-2 border-b border-blue-100 dark:border-blue-900"
            dangerouslySetInnerHTML={{ __html: node.attrs.preambleHtml }}
          />
        )}
        <div
          className="text-sm prose prose-sm dark:prose-invert max-w-none"
          dangerouslySetInnerHTML={{ __html: node.attrs.html }}
        />
      </div>
    </NodeViewWrapper>
  );
}
```

- [ ] **Step 5: Register in TipTap editor**

In `src/components/editor/tiptap-editor.tsx`, import the node and configure the node view:

```typescript
import { QuestionContextNode } from '@/lib/editor/question-context-node';
import { QuestionContextBlockView } from '@/components/assignments/question-context-block';
import { ReactNodeViewRenderer } from '@tiptap/react';

// In the useEditor extensions array:
extensions: [
  // ... existing extensions
  QuestionContextNode.extend({
    addNodeView() {
      return ReactNodeViewRenderer(QuestionContextBlockView);
    },
  }),
],
```

This approach avoids circular imports — the node definition stays pure (no React dependency) and the view renderer is wired in the editor component where React is already loaded.

- [ ] **Step 6: Run tests**

Run: `npx vitest run src/lib/editor/question-context-node.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/lib/editor/question-context-node.ts src/lib/editor/question-context-node.test.ts src/components/assignments/question-context-block.tsx src/components/editor/tiptap-editor.tsx
git commit -m "feat(editor): add non-editable question context block TipTap node"
```

---

## Task 7: AI Context — Question Awareness

**Files:**
- Modify: `src/lib/actions/ai-context.ts`
- Modify: `src/lib/ai/prompts.ts`

- [ ] **Step 1: Update system prompt for question context**

In `src/lib/ai/prompts.ts`, update `buildSystemPrompt` to accept and include question context:

```typescript
// Add to the BuildSystemPromptOptions interface:
questionContext?: { label: string; html: string } | null;

// Add to the prompt body (after STUDENT'S DOCUMENT section):
if (options.questionContext) {
  prompt += `\n\nHOMEWORK QUESTION:\nThe student is working on Question ${options.questionContext.label} of their assignment. Here is the question:\n${options.questionContext.html}\n\nFocus your answers on helping them solve this specific question.`;
}
```

- [ ] **Step 2: Update askQuestion to extract question context from document**

In `src/lib/actions/ai-context.ts`, in the `askQuestion` function, before building the system prompt, scan the provided `documentContent` for question context blocks:

```typescript
// Extract question context from document content (TipTap JSON)
function extractQuestionContext(
  content: Record<string, unknown> | null,
): { label: string; html: string } | null {
  if (!content || !Array.isArray((content as any).content)) return null;
  const nodes = (content as any).content as Array<Record<string, unknown>>;
  const questionNode = nodes.find((n) => n.type === 'questionContext');
  if (!questionNode || !questionNode.attrs) return null;
  const attrs = questionNode.attrs as Record<string, string>;
  return { label: attrs.label ?? '', html: attrs.html ?? '' };
}
```

Call `extractQuestionContext(documentContent)` in `buildAiContext` (the function the streaming endpoint `/api/ai/ask` uses) and pass the result into `buildSystemPrompt({ ..., questionContext })`.

- [ ] **Step 3: Write test for extractQuestionContext**

Add to `src/lib/actions/__tests__/ai-context.test.ts`:

```typescript
import { extractQuestionContext } from '../ai-context';

describe('extractQuestionContext', () => {
  it('extracts question context from TipTap document JSON', () => {
    const content = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'My answer' }] },
        { type: 'questionContext', attrs: { label: '3a', html: '<p>Find derivative</p>', preambleHtml: null } },
      ],
    };
    const result = extractQuestionContext(content);
    expect(result).toEqual({ label: '3a', html: '<p>Find derivative</p>' });
  });

  it('returns null when no question context block exists', () => {
    const content = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Just notes' }] },
      ],
    };
    expect(extractQuestionContext(content)).toBeNull();
  });

  it('returns null for null content', () => {
    expect(extractQuestionContext(null)).toBeNull();
  });
});
```

- [ ] **Step 4: Update prompt tests**

Add to `src/lib/ai/__tests__/prompts.test.ts`:

```typescript
it('includes homework question context when provided', () => {
  const prompt = buildSystemPrompt({
    courseName: 'Calculus I',
    hasDocumentContent: true,
    questionContext: { label: '3a', html: '<p>Find the derivative of f(x)=x^2</p>' },
  });
  expect(prompt).toContain('HOMEWORK QUESTION');
  expect(prompt).toContain('Question 3a');
  expect(prompt).toContain('derivative');
});
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/lib/ai/__tests__/prompts.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/actions/ai-context.ts src/lib/ai/prompts.ts src/lib/ai/__tests__/prompts.test.ts
git commit -m "feat(ai): detect question context blocks and include in AI prompt"
```

---

## Task 8: Question Browser Panel Component

**Files:**
- Create: `src/components/assignments/question-browser-panel.tsx`
- Create: `src/components/assignments/question-browser-panel.test.tsx`

- [ ] **Step 1: Write failing component test**

Create `src/components/assignments/question-browser-panel.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QuestionBrowserPanel } from './question-browser-panel';

// Mock fetch for splits API
global.fetch = vi.fn().mockResolvedValue({
  ok: true,
  json: () => Promise.resolve({
    splits: [{
      id: 'split-1',
      creator_type: 'ai',
      is_personal: false,
      content_version: 1,
      created_at: '2026-03-18T00:00:00Z',
      split_questions: [
        { id: 'q1', label: '1', position: 0, boundary_start: 0, boundary_end: 30, low_confidence: false },
        { id: 'q2', label: '2', position: 1, boundary_start: 30, boundary_end: 60, low_confidence: false },
      ],
    }],
  }),
});

describe('QuestionBrowserPanel', () => {
  it('renders question list from selected split', async () => {
    render(
      <QuestionBrowserPanel
        assignmentId="assign-1"
        descriptionHtml="<p>Q1: Solve</p><p>Q2: Prove</p>"
        isOpen={true}
        onClose={() => {}}
        onCopyQuestion={() => {}}
      />
    );

    // Should show questions after loading
    expect(await screen.findByText(/Question 1/)).toBeTruthy();
    expect(await screen.findByText(/Question 2/)).toBeTruthy();
  });

  it('calls onCopyQuestion when a question is clicked', async () => {
    const onCopy = vi.fn();
    render(
      <QuestionBrowserPanel
        assignmentId="assign-1"
        descriptionHtml="<p>Q1: Solve</p>"
        isOpen={true}
        onClose={() => {}}
        onCopyQuestion={onCopy}
      />
    );

    const button = await screen.findByText(/Copy to document/);
    button.click();
    expect(onCopy).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/components/assignments/question-browser-panel.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement the panel component**

Create `src/components/assignments/question-browser-panel.tsx`:

```typescript
'use client';

import { useEffect, useState, useCallback } from 'react';
import { X, ChevronDown, Copy, Plus } from 'lucide-react';
import type { SplitWithQuestions } from '@/types/assignments';

interface QuestionBrowserPanelProps {
  assignmentId: string;
  descriptionHtml: string;
  isOpen: boolean;
  onClose: () => void;
  onCopyQuestion: (params: {
    label: string;
    html: string;
    preambleHtml: string | null;
    assignmentId: string;
    splitId: string;
    createNewDoc: boolean;
  }) => void;
}

export function QuestionBrowserPanel({
  assignmentId,
  descriptionHtml,
  isOpen,
  onClose,
  onCopyQuestion,
}: QuestionBrowserPanelProps) {
  const [splits, setSplits] = useState<SplitWithQuestions[]>([]);
  const [selectedSplitId, setSelectedSplitId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // Fetch splits
  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    fetch(`/api/moodle/assignments/splits?assignmentId=${assignmentId}`)
      .then((r) => r.json())
      .then(({ splits: data }) => {
        setSplits(data);
        if (data.length > 0 && !selectedSplitId) {
          setSelectedSplitId(data[0].id); // Latest shared is default
        }
      })
      .finally(() => setLoading(false));
  }, [isOpen, assignmentId]);

  const selectedSplit = splits.find((s) => s.id === selectedSplitId);
  // Supabase returns join as snake_case 'split_questions', remap to camelCase
  const questions = (selectedSplit as any)?.split_questions ?? selectedSplit?.questions ?? [];

  const getQuestionHtml = useCallback(
    (start: number, end: number) => descriptionHtml.slice(start, end),
    [descriptionHtml],
  );

  const getSplitLabel = (split: SplitWithQuestions) => {
    if (split.creator_type === 'ai') return 'AI Split';
    if (split.is_personal) return 'My Split';
    return `Student Split (${new Date(split.created_at).toLocaleDateString()})`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background border-l md:inset-auto md:right-0 md:top-0 md:h-full md:w-[420px]">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h3 className="font-semibold text-sm">Questions</h3>
        <button onClick={onClose} className="p-1 hover:bg-muted rounded">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Split selector */}
      <div className="border-b px-4 py-2">
        <div className="relative">
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center justify-between w-full text-sm px-3 py-2 rounded border bg-muted/50"
          >
            <span>{selectedSplit ? getSplitLabel(selectedSplit) : 'Select split...'}</span>
            <ChevronDown className="h-3 w-3" />
          </button>
          {dropdownOpen && (
            <div className="absolute top-full left-0 right-0 mt-1 border rounded bg-background shadow-lg z-10 max-h-48 overflow-y-auto">
              {splits.map((split) => (
                <button
                  key={split.id}
                  onClick={() => {
                    setSelectedSplitId(split.id);
                    setDropdownOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-muted ${
                    split.id === selectedSplitId ? 'bg-muted font-medium' : ''
                  }`}
                >
                  {getSplitLabel(split)} ({split.questions.length} questions)
                  {split.content_version < (splits[0]?.content_version ?? 0) && (
                    <span className="ml-2 text-xs text-amber-500">(older version)</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Question list */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
            Loading questions...
          </div>
        )}
        {!loading && questions.length === 0 && (
          <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
            No questions found. Try a different split.
          </div>
        )}
        {questions
          .sort((a, b) => a.position - b.position)
          .map((q) => {
            const qHtml = getQuestionHtml(q.boundary_start, q.boundary_end);
            const preambleHtml =
              q.preamble_start != null && q.preamble_end != null
                ? getQuestionHtml(q.preamble_start, q.preamble_end)
                : null;

            return (
              <div
                key={q.id}
                className="border-b px-4 py-3 hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                    Question {q.label}
                  </span>
                  {q.low_confidence && (
                    <span className="text-xs text-amber-500">Low confidence</span>
                  )}
                </div>
                <div
                  className="text-sm text-muted-foreground line-clamp-3 mb-2"
                  dangerouslySetInnerHTML={{ __html: qHtml }}
                />
                <div className="flex items-center gap-3">
                  <button
                    onClick={() =>
                      onCopyQuestion({
                        label: q.label,
                        html: qHtml,
                        preambleHtml,
                        assignmentId,
                        splitId: selectedSplitId!,
                        createNewDoc: false,
                      })
                    }
                    className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400"
                  >
                    <Copy className="h-3 w-3" />
                    Copy to document
                  </button>
                  <button
                    onClick={() =>
                      onCopyQuestion({
                        label: q.label,
                        html: qHtml,
                        preambleHtml,
                        assignmentId,
                        splitId: selectedSplitId!,
                        createNewDoc: true,
                      })
                    }
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <Plus className="h-3 w-3" />
                    New document
                  </button>
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/components/assignments/question-browser-panel.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/assignments/question-browser-panel.tsx src/components/assignments/question-browser-panel.test.tsx
git commit -m "feat(ui): add question browser side panel for assignments"
```

---

## Task 9: Split Editor Component

**Files:**
- Create: `src/components/assignments/split-editor.tsx`
- Create: `src/components/assignments/split-editor.test.tsx`

- [ ] **Step 1: Write failing test**

Create `src/components/assignments/split-editor.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SplitEditor } from './split-editor';

describe('SplitEditor', () => {
  const defaultProps = {
    descriptionHtml: '<p>Question 1: Solve x=1</p><p>Question 2: Prove y=2</p>',
    initialBoundaries: [
      { label: '1', position: 0, boundaryStart: 0, boundaryEnd: 28 },
      { label: '2', position: 1, boundaryStart: 28, boundaryEnd: 56 },
    ],
    onSave: vi.fn(),
    onCancel: vi.fn(),
  };

  it('renders the assignment content with boundary markers', () => {
    render(<SplitEditor {...defaultProps} />);
    expect(screen.getByText(/Question 1/)).toBeTruthy();
    expect(screen.getByText(/Question 2/)).toBeTruthy();
  });

  it('calls onSave with updated boundaries when save is clicked', () => {
    render(<SplitEditor {...defaultProps} />);
    const saveBtn = screen.getByText(/Save as shared/);
    fireEvent.click(saveBtn);
    expect(defaultProps.onSave).toHaveBeenCalledWith(
      expect.objectContaining({ isPersonal: false }),
    );
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/components/assignments/split-editor.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement the split editor**

Create `src/components/assignments/split-editor.tsx`:

```typescript
'use client';

import { useState, useCallback } from 'react';
import type { QuestionBoundary } from '@/types/assignments';

interface SplitEditorProps {
  descriptionHtml: string;
  initialBoundaries: QuestionBoundary[];
  onSave: (params: { boundaries: QuestionBoundary[]; isPersonal: boolean }) => void;
  onCancel: () => void;
}

export function SplitEditor({
  descriptionHtml,
  initialBoundaries,
  onSave,
  onCancel,
}: SplitEditorProps) {
  const [boundaries, setBoundaries] = useState<QuestionBoundary[]>(initialBoundaries);
  const [editingLabel, setEditingLabel] = useState<number | null>(null);

  // Get HTML segment for a boundary
  const getSegment = useCallback(
    (start: number, end: number) => descriptionHtml.slice(start, end),
    [descriptionHtml],
  );

  // Drag a boundary to a new position (adjusts end of current and start of next)
  const dragBoundary = (index: number, newEndPosition: number) => {
    if (index >= boundaries.length - 1) return;
    const snapped = snapToElementBoundary(descriptionHtml, newEndPosition);
    const updated = [...boundaries];
    updated[index] = { ...updated[index], boundaryEnd: snapped };
    updated[index + 1] = { ...updated[index + 1], boundaryStart: snapped };
    setBoundaries(updated);
  };

  // Merge two adjacent questions
  const mergeQuestions = (index: number) => {
    if (index >= boundaries.length - 1) return;
    const updated = [...boundaries];
    const current = updated[index];
    const next = updated[index + 1];
    updated[index] = {
      ...current,
      boundaryEnd: next.boundaryEnd,
    };
    updated.splice(index + 1, 1);
    // Re-number positions
    updated.forEach((b, i) => (b.position = i));
    setBoundaries(updated);
  };

  // Split a question at a midpoint
  const splitQuestion = (index: number) => {
    const q = boundaries[index];
    const mid = Math.floor((q.boundaryStart + q.boundaryEnd) / 2);
    // Snap to nearest > or < (HTML tag boundary)
    const snapped = snapToElementBoundary(descriptionHtml, mid);
    const updated = [...boundaries];
    const newQ: QuestionBoundary = {
      label: `${q.label}b`,
      position: index + 1,
      boundaryStart: snapped,
      boundaryEnd: q.boundaryEnd,
    };
    updated[index] = { ...q, label: `${q.label}a`, boundaryEnd: snapped };
    updated.splice(index + 1, 0, newQ);
    updated.forEach((b, i) => (b.position = i));
    setBoundaries(updated);
  };

  // Update a label
  const updateLabel = (index: number, newLabel: string) => {
    const updated = [...boundaries];
    updated[index] = { ...updated[index], label: newLabel };
    setBoundaries(updated);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b px-4 py-2">
        <button onClick={onCancel} className="text-sm text-muted-foreground hover:text-foreground">
          Cancel
        </button>
        <div className="flex-1" />
        <button
          onClick={() => onSave({ boundaries, isPersonal: true })}
          className="text-sm px-3 py-1 rounded border hover:bg-muted"
        >
          Save as personal
        </button>
        <button
          onClick={() => onSave({ boundaries, isPersonal: false })}
          className="text-sm px-3 py-1 rounded bg-blue-600 text-white hover:bg-blue-700"
        >
          Save as shared
        </button>
      </div>

      {/* Content with boundaries */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {boundaries.map((b, i) => (
          <div key={`${b.position}-${b.label}`}>
            {/* Drag handle between questions (not before first) */}
            {i > 0 && (
              <div
                className="flex items-center justify-center h-4 cursor-row-resize group"
                draggable
                onDragEnd={(e) => {
                  // Calculate approximate character position from vertical position
                  // This is a simplified approach — production would use precise DOM mapping
                  const containerRect = e.currentTarget.parentElement?.getBoundingClientRect();
                  if (!containerRect) return;
                  const ratio = (e.clientY - containerRect.top) / containerRect.height;
                  const charPos = Math.floor(ratio * descriptionHtml.length);
                  dragBoundary(i - 1, charPos);
                }}
              >
                <div className="w-16 h-1 rounded bg-muted-foreground/30 group-hover:bg-blue-400 transition-colors" />
              </div>
            )}
            <div className="rounded border-l-4 border-blue-400 bg-blue-50 dark:bg-blue-950 p-3">
            {/* Question header */}
            <div className="flex items-center gap-2 mb-2">
              {editingLabel === i ? (
                <input
                  autoFocus
                  defaultValue={b.label}
                  onBlur={(e) => {
                    updateLabel(i, e.target.value);
                    setEditingLabel(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      updateLabel(i, (e.target as HTMLInputElement).value);
                      setEditingLabel(null);
                    }
                  }}
                  className="text-xs font-bold w-16 px-1 py-0.5 border rounded"
                />
              ) : (
                <button
                  onClick={() => setEditingLabel(i)}
                  className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Q{b.label}
                </button>
              )}
              <div className="flex-1" />
              <button
                onClick={() => splitQuestion(i)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Split
              </button>
              {i < boundaries.length - 1 && (
                <button
                  onClick={() => mergeQuestions(i)}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Merge with next
                </button>
              )}
            </div>

            {/* Content preview */}
            <div
              className="text-sm prose prose-sm dark:prose-invert max-w-none"
              dangerouslySetInnerHTML={{ __html: getSegment(b.boundaryStart, b.boundaryEnd) }}
            />
          </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Snap a character position to the nearest HTML closing tag boundary.
 * Uses the same approach as snapBoundariesToElements in split-assignment.ts.
 */
function snapToElementBoundary(html: string, position: number): number {
  const validPositions = [0];
  const tagRegex = /<\/[a-z][a-z0-9]*>/gi;
  let match;
  while ((match = tagRegex.exec(html)) !== null) {
    validPositions.push(match.index + match[0].length);
  }
  validPositions.push(html.length);

  let closest = validPositions[0];
  for (const vp of validPositions) {
    if (Math.abs(vp - position) < Math.abs(closest - position)) closest = vp;
  }
  return closest;
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/components/assignments/split-editor.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/assignments/split-editor.tsx src/components/assignments/split-editor.test.tsx
git commit -m "feat(ui): add split editor for creating/editing question boundaries"
```

---

## Task 10: Integration — Wire Everything Together

**Files:**
- Modify: `src/components/editor/tiptap-editor.tsx` (add question browser trigger)
- Modify: sync flow component (where sync results are processed client-side)
- Create: `src/hooks/use-split-view-preference.ts` (feature flag)

- [ ] **Step 1: Add question browser button to editor toolbar**

In `src/components/editor/tiptap-editor.tsx`, add a button next to the AI chat button. This button opens the question browser panel. Only show it when the current document's course has assignments with splits. Pass an `onCopyQuestion` handler:

```typescript
import { QuestionBrowserPanel } from '@/components/assignments/question-browser-panel';

// State in the editor component:
const [questionBrowserOpen, setQuestionBrowserOpen] = useState(false);
const [activeAssignment, setActiveAssignment] = useState<{ id: string; descriptionHtml: string } | null>(null);

const handleCopyQuestion = ({ label, html, preambleHtml, assignmentId, splitId, createNewDoc }) => {
  if (createNewDoc) {
    // Create a new document with the question context block
    // Use existing createDocument server action, then navigate to it
    // with the question context pre-inserted
    return;
  }

  // Insert into current document
  editor?.chain().focus().insertContent({
    type: 'questionContext',
    attrs: { label, html, preambleHtml, assignmentId, splitId },
  }).run();
};

// In the JSX, alongside the AI chat wrapper:
{activeAssignment && (
  <QuestionBrowserPanel
    assignmentId={activeAssignment.id}
    descriptionHtml={activeAssignment.descriptionHtml}
    isOpen={questionBrowserOpen}
    onClose={() => setQuestionBrowserOpen(false)}
    onCopyQuestion={handleCopyQuestion}
  />
)}
```

- [ ] **Step 2: Trigger AI split after assignment sync (new AND changed)**

In the sync flow (client-side, wherever sync results are processed after `upsertMoodleData` returns), fire background requests for both new and content-changed assignments:

```typescript
for (const result of syncResponse.assignmentResults) {
  if (result.isNew || result.contentChanged) {
    fetch('/api/moodle/assignments/split', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignmentId: result.assignmentId }),
    }).catch(() => {}); // Best-effort, don't block sync
  }
}
```

This covers FR-006 (first sync) AND FR-006a (re-sync with content change).

- [ ] **Step 3: Implement feature flag hook**

Create `src/hooks/use-split-view-preference.ts`:

```typescript
'use client';

import { useState, useCallback, useEffect } from 'react';

const STORAGE_KEY = 'typenote:split-view-enabled';

/**
 * Per-student preference for showing split question view vs raw assignment content.
 * Stored in localStorage (single-device persistence — cross-device via profiles table is future work).
 * Default: enabled.
 */
export function useSplitViewPreference() {
  const [enabled, setEnabledState] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored !== null) {
      setEnabledState(stored === 'true');
    }
  }, []);

  const setEnabled = useCallback((value: boolean) => {
    setEnabledState(value);
    localStorage.setItem(STORAGE_KEY, String(value));
  }, []);

  return { splitViewEnabled: enabled, setSplitViewEnabled: setEnabled };
}
```

Use this hook wherever assignments are displayed — if `splitViewEnabled` is false, render raw `descriptionHtml` instead of the question browser.

- [ ] **Step 4: Add image handling for authenticated Moodle images (FR-005)**

Create `src/lib/moodle/assignment-images.ts`:

```typescript
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Scan assignment HTML for img src URLs that point to Moodle,
 * download them via the extension, store in Supabase Storage,
 * and rewrite the src attributes to point to stored copies.
 *
 * This is called after upserting the assignment, as a second pass.
 */
export async function processAssignmentImages(
  assignmentId: string,
  descriptionHtml: string,
  moodleDomain: string,
): Promise<string> {
  // Extract all img src URLs that point to the Moodle domain
  const imgRegex = /<img[^>]+src="([^"]*)"[^>]*>/gi;
  let match;
  const moodleImages: { fullMatch: string; src: string }[] = [];

  while ((match = imgRegex.exec(descriptionHtml)) !== null) {
    const src = match[1];
    if (src.includes(moodleDomain) || src.startsWith('/')) {
      moodleImages.push({ fullMatch: match[0], src });
    }
  }

  if (moodleImages.length === 0) return descriptionHtml;

  // For each Moodle image, the extension will need to download and upload it.
  // This is triggered client-side via DOWNLOAD_AND_UPLOAD message to the extension.
  // The server stores a mapping of original URL → storage path.
  // For now, flag these images for client-side processing and return HTML with
  // data attributes marking them for lazy download.

  let processedHtml = descriptionHtml;
  for (const img of moodleImages) {
    const absoluteSrc = img.src.startsWith('/')
      ? `https://${moodleDomain}${img.src}`
      : img.src;
    processedHtml = processedHtml.replace(
      img.fullMatch,
      img.fullMatch.replace(img.src, absoluteSrc).replace('<img', '<img data-moodle-image="true"'),
    );
  }

  return processedHtml;
}
```

Note: Full image downloading via the extension requires client-side coordination (the extension holds the Moodle session). The server-side function here normalizes URLs and flags images. The actual download+upload flow mirrors the existing `DOWNLOAD_AND_UPLOAD` handler used for files.

- [ ] **Step 5: Run full test suite**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/components/editor/tiptap-editor.tsx src/hooks/use-split-view-preference.ts src/lib/moodle/assignment-images.ts
git commit -m "feat: wire question browser, AI split trigger, feature flag, and image handling"
```

---

## Task 11: End-to-End Verification

- [ ] **Step 1: Run full unit test suite**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 2: Run linter**

Run: `npx eslint .`
Expected: No errors

- [ ] **Step 3: Run build**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 4: Manual smoke test**

Start dev server, sync a Moodle course with assignments, verify:
1. Assignments appear as distinct entities (not links)
2. AI split is generated automatically
3. Question browser panel shows questions
4. Clicking a question copies it into the document
5. AI chat recognizes the question context
6. Split editor allows editing boundaries
7. Feature flag toggles raw/split view

- [ ] **Step 5: Final commit and push**

```bash
git push origin 012-assignment-questions
```
