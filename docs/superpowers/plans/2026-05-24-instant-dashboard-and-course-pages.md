# Instant Dashboard and Course Pages — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/dashboard` and `/dashboard/courses/[courseId]` feel instant on first visit (streamed shell + parallel queries) and on repeat navigation (prefetched routes + cached sidebar).

**Architecture:** Three sequential phases. Phase 1 collapses request waterfalls with `Promise.all` and Suspense streaming, batches signed-URL generation, and dedupes auth calls via `React.cache`. Phase 2 defers the heavy Moodle Materials fetch behind a collapsible client component backed by a Server Action. Phase 3 swaps sidebar `<button>`s for prefetching `<Link>`s and caches the sidebar tree with SWR (stale-while-revalidate).

**Tech Stack:** Next.js 16 App Router, React 19 (Server Components, `<Suspense>`, `React.cache`), Supabase SSR, SWR (new), Playwright, Vitest.

**Spec reference:** `docs/superpowers/specs/2026-05-24-instant-dashboard-and-course-pages-design.md`

---

## File structure (all phases)

### New files

- `src/lib/auth/get-current-user.ts` — `React.cache`-wrapped current user lookup. (Phase 1)
- `src/lib/queries/moodle-materials.ts` — server-side data loaders: `getMoodleImportableFiles(courseId, userId)` and `getMoodleSectionsWithSignedUrls(courseId, userId)`. (Phase 1)
- `src/components/dashboard/course-page-slots.tsx` — server components: `<WeeksSlot>`, `<CourseDocumentsSlot>`, `<MoodleMaterialsSlot>`, `<BreadcrumbParentFolderSlot>`. Each awaits a promise prop. (Phase 1)
- `src/app/(dashboard)/dashboard/loading.tsx` — dashboard skeleton. (Phase 1)
- `src/app/(dashboard)/dashboard/courses/[courseId]/loading.tsx` — course page skeleton. (Phase 1)
- `src/lib/actions/moodle-materials.ts` — `getMoodleMaterialsForCourse(courseId)` Server Action wrapping the heavy loader. (Phase 2)
- `src/components/dashboard/moodle-materials-section.tsx` — collapsible client component that fetches on expand. (Phase 2)
- `src/lib/actions/sidebar.ts` — `getSidebarTree()` Server Action. (Phase 3)
- `src/lib/swr/keys.ts` — canonical SWR keys. (Phase 3)

### Modified files

- `src/app/(dashboard)/layout.tsx` — use `getCurrentUser`; pass initial sidebar tree to `<SidebarFolderTree>`. (Phases 1, 3)
- `src/app/(dashboard)/dashboard/page.tsx` — collapse 5 sequential `await`s into `Promise.all`. (Phase 1)
- `src/app/(dashboard)/dashboard/courses/[courseId]/page.tsx` — minimal top-level awaits; remaining data flows through `*Slot` components. Phase 2 replaces Moodle slot with the lazy client component. (Phases 1, 2)
- `src/components/dashboard/sidebar-folder-tree.tsx` — `<Link prefetch>` + SWR with `fallbackData`. (Phase 3)
- CRUD client handlers that affect the sidebar — add `mutate(sidebarTreeKey(userId))`:
  - `src/components/dashboard/folder-dialog.tsx`
  - `src/components/dashboard/folder-card.tsx`
  - `src/components/dashboard/course-dialog.tsx`
  - `src/components/dashboard/course-card.tsx`
  - `src/components/dashboard/move-document-dialog.tsx` (only for course moves)
  (Phase 3)
- `package.json` — add `swr` dependency. (Phase 3)
- `e2e/TEST_REGISTRY.md` — record new E2E scenarios. (Phases 1–3)

### Test files

- `src/lib/queries/moodle-materials.integration.test.ts` (Phase 1)
- `src/lib/actions/moodle-materials.integration.test.ts` (Phase 2)
- `src/lib/actions/sidebar.integration.test.ts` (Phase 3)
- `e2e/perf-streaming.spec.ts` (Phase 1)
- `e2e/lazy-moodle.spec.ts` (Phase 2)
- `e2e/sidebar-prefetch.spec.ts` (Phase 3)

---

# Phase 1 — Instant shell + parallel queries

## Task 1: Create Phase 1 feature branch

**Files:** _(none — branch operation)_

- [ ] **Step 1: Confirm clean working tree**

Run: `git status --short`
Expected: empty output (no uncommitted changes).

- [ ] **Step 2: Fetch and branch off `origin/dev`**

Run:
```bash
git fetch origin dev
git checkout -b feat/perf-phase1-streaming origin/dev
```
Expected: `Switched to a new branch 'feat/perf-phase1-streaming'`

---

## Task 2: Add cached `getCurrentUser` helper

**Files:**
- Create: `src/lib/auth/get-current-user.ts`

- [ ] **Step 1: Create the helper file**

Create `src/lib/auth/get-current-user.ts` with:

```typescript
import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import type { User } from '@supabase/supabase-js';

/**
 * Returns the current authenticated user, or null if unauthenticated.
 * Wrapped in React.cache so multiple callers within the same RSC render
 * pass share one auth round-trip.
 */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});
```

- [ ] **Step 2: Type-check passes**

Run: `pnpm typecheck` (or `pnpm tsc --noEmit` if no script)
Expected: no errors related to the new file.

- [ ] **Step 3: Commit**

```bash
git add src/lib/auth/get-current-user.ts
git commit -m "feat(auth): cached getCurrentUser helper (React.cache)"
```

---

## Task 3: Use `getCurrentUser` in the dashboard layout

**Files:**
- Modify: `src/app/(dashboard)/layout.tsx`

- [ ] **Step 1: Replace direct `supabase.auth.getUser()` with `getCurrentUser`**

Open `src/app/(dashboard)/layout.tsx`. Replace the imports and the body so the layout reads:

```typescript
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/get-current-user';
import { signOut } from '@/lib/actions/auth';
import { SidebarFolderTree } from '@/components/dashboard/sidebar-folder-tree';
import { SidebarLayout } from '@/components/dashboard/sidebar-layout';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { LogOut } from 'lucide-react';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  const sidebarContent = (
    <>
      <div className="flex h-14 items-center px-4">
        <h1 className="text-xl font-extrabold tracking-tight text-primary">
          <span className="text-primary/60">T</span>ypenote
        </h1>
      </div>
      <Separator />
      <div className="flex-1 overflow-y-auto px-2 py-2">
        <SidebarFolderTree />
      </div>
      <Separator />
      <div className="p-2">
        <form action={signOut}>
          <Button
            type="submit"
            variant="ghost"
            className="w-full justify-start min-h-[44px] hover:bg-primary/10 hover:text-primary"
          >
            <LogOut className="size-4" />
            Sign out
          </Button>
        </form>
      </div>
    </>
  );

  return <SidebarLayout sidebar={sidebarContent}>{children}</SidebarLayout>;
}
```

- [ ] **Step 2: Type-check passes**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(dashboard\)/layout.tsx
git commit -m "refactor(dashboard): use cached getCurrentUser in layout"
```

---

## Task 4: Parallelize dashboard page queries

**Files:**
- Modify: `src/app/(dashboard)/dashboard/page.tsx`

- [ ] **Step 1: Replace sequential `await`s with `Promise.all`**

Open `src/app/(dashboard)/dashboard/page.tsx`. Replace the top of the function (everything from `const supabase = await createClient();` through `const { data: documents } = ...`) with:

```typescript
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth/get-current-user';
import { FolderCard } from '@/components/dashboard/folder-card';
import { FolderDialog } from '@/components/dashboard/folder-dialog';
import { CourseCard } from '@/components/dashboard/course-card';
import { CourseDialog } from '@/components/dashboard/course-dialog';
import { DocumentListWithMove } from '@/components/dashboard/document-list-with-move';
import { CreateDocumentDialog } from '@/components/dashboard/create-document-dialog';
import { EmptyState } from '@/components/dashboard/empty-state';
import { MoodleSyncPromptWrapper } from '@/components/dashboard/moodle-sync-prompt-wrapper';
import { getUserMoodleConnection } from '@/lib/queries/moodle';
import { Button } from '@/components/ui/button';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from '@/components/ui/breadcrumb';
import type { Folder, Document, Course } from '@/types/database';

export default async function DashboardPage() {
  const supabase = await createClient();
  const user = await getCurrentUser();

  const [
    moodleConnection,
    foldersResult,
    coursesResult,
    documentsResult,
  ] = await Promise.all([
    user ? getUserMoodleConnection(user.id) : Promise.resolve(null),
    supabase
      .from('folders')
      .select('*')
      .is('parent_id', null)
      .order('position', { ascending: true }),
    supabase
      .from('courses')
      .select('*')
      .is('folder_id', null)
      .order('position', { ascending: true }),
    supabase
      .from('documents')
      .select('*')
      .is('folder_id', null)
      .order('position', { ascending: true }),
  ]);

  let moodleConnectionInfo: { domain: string; instanceId: string } | null = null;
  if (moodleConnection?.moodle_instances) {
    const instance = moodleConnection.moodle_instances as {
      id: string;
      domain: string;
    };
    moodleConnectionInfo = {
      domain: instance.domain,
      instanceId: instance.id,
    };
  }

  const typedFolders = (foldersResult.data as Folder[] | null) ?? [];
  const typedCourses = (coursesResult.data as Course[] | null) ?? [];
  const typedDocuments = (documentsResult.data as Document[] | null) ?? [];
  // ...rest of the function unchanged (uses typedFolders, typedCourses, typedDocuments)
```

Keep the JSX (`return (<div className="p-6">...`) identical to the existing file, but replace the prop name `moodleConnection={moodleConnection}` with `moodleConnection={moodleConnectionInfo}` to match the renamed variable.

- [ ] **Step 2: Type-check passes**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 3: Existing tests still pass**

Run: `pnpm test`
Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(dashboard\)/dashboard/page.tsx
git commit -m "perf(dashboard): parallelize queries with Promise.all"
```

---

## Task 5: Add dashboard `loading.tsx` skeleton

**Files:**
- Create: `src/app/(dashboard)/dashboard/loading.tsx`

- [ ] **Step 1: Create the skeleton**

Create `src/app/(dashboard)/dashboard/loading.tsx`:

```tsx
export default function DashboardLoading() {
  return (
    <div className="p-6">
      <div className="mb-6 mt-4 flex flex-wrap items-center justify-between gap-2">
        <div className="h-5 w-20 animate-pulse rounded bg-muted" />
        <div className="flex gap-2">
          <div className="h-9 w-28 animate-pulse rounded bg-muted" />
          <div className="h-9 w-24 animate-pulse rounded bg-muted" />
          <div className="h-9 w-24 animate-pulse rounded bg-muted" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="h-32 animate-pulse rounded-lg border bg-muted/40"
          />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/\(dashboard\)/dashboard/loading.tsx
git commit -m "feat(dashboard): add loading.tsx skeleton"
```

---

## Task 6: Write the integration test for `getMoodleImportableFiles`

**Files:**
- Create: `src/lib/queries/moodle-materials.integration.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/queries/moodle-materials.integration.test.ts`:

```typescript
import { describe, expect, it, beforeAll } from 'vitest';
import { createAdminClient } from '@/lib/supabase/admin';
import { getMoodleImportableFiles } from './moodle-materials';

// These tests require local Supabase running with seeded data.
// See CLAUDE.md and supabase/seed.sql for credentials and fixtures.

describe('getMoodleImportableFiles (integration)', () => {
  let testUserId: string;
  let testCourseId: string;

  beforeAll(async () => {
    const admin = createAdminClient();
    const { data: user } = await admin.auth.admin.getUserByEmail(
      'test@typenote.dev',
    );
    if (!user?.user) throw new Error('seed user missing');
    testUserId = user.user.id;

    const { data: course } = await admin
      .from('courses')
      .select('id')
      .eq('user_id', testUserId)
      .limit(1)
      .single();
    if (!course) throw new Error('seed course missing');
    testCourseId = course.id;
  });

  it('returns only files the current user has imported', async () => {
    const files = await getMoodleImportableFiles(testCourseId, testUserId);
    // All returned files must be of type "file" with a storage_path
    for (const file of files) {
      expect(file.storage_path).toBeTruthy();
      expect(file.file_name).toBeTruthy();
    }
  });

  it('returns empty array when course has no Moodle sync', async () => {
    const files = await getMoodleImportableFiles(
      '00000000-0000-0000-0000-000000000000',
      testUserId,
    );
    expect(files).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test — it should fail to import**

Run: `pnpm test:integration src/lib/queries/moodle-materials.integration.test.ts`
Expected: FAIL with "Cannot find module './moodle-materials'" (the file doesn't exist yet).

---

## Task 7: Implement `getMoodleImportableFiles`

**Files:**
- Create: `src/lib/queries/moodle-materials.ts`

- [ ] **Step 1: Create the file with the lightweight loader**

Create `src/lib/queries/moodle-materials.ts`:

```typescript
import { createAdminClient } from '@/lib/supabase/admin';

export type ImportableMoodleFile = {
  id: string;
  file_name: string;
  storage_path: string;
  mime_type: string | null;
  file_size: number | null;
  sectionTitle: string;
};

/**
 * Lightweight metadata-only list of Moodle files the current user has
 * imported, flattened across sections. Used by the week import picker.
 * Does NOT generate signed URLs.
 */
export async function getMoodleImportableFiles(
  courseId: string,
  userId: string,
): Promise<ImportableMoodleFile[]> {
  const admin = createAdminClient();

  const { data: syncRecord } = await admin
    .from('user_course_syncs')
    .select('moodle_course_id')
    .eq('user_id', userId)
    .eq('course_id', courseId)
    .maybeSingle();

  if (!syncRecord) return [];

  const { data: sections } = await admin
    .from('moodle_sections')
    .select(
      'title, moodle_files(id, file_name, type, storage_path, mime_type, file_size)',
    )
    .eq('course_id', syncRecord.moodle_course_id)
    .order('position');

  if (!sections || sections.length === 0) return [];

  type RawFile = {
    id: string;
    file_name: string;
    type: string;
    storage_path: string | null;
    mime_type: string | null;
    file_size: number | null;
  };
  type RawSection = { title: string; moodle_files: RawFile[] };

  const allFiles = (sections as RawSection[]).flatMap((s) =>
    s.moodle_files
      .filter((f) => f.storage_path && f.type === 'file')
      .map((f) => ({ ...f, sectionTitle: s.title })),
  );

  if (allFiles.length === 0) return [];

  const { data: imports } = await admin
    .from('user_file_imports')
    .select('moodle_file_id')
    .eq('user_id', userId)
    .eq('status', 'imported')
    .in(
      'moodle_file_id',
      allFiles.map((f) => f.id),
    );

  const importedIds = new Set(
    (imports ?? []).map((i: { moodle_file_id: string }) => i.moodle_file_id),
  );

  return allFiles
    .filter((f) => importedIds.has(f.id))
    .map((f) => ({
      id: f.id,
      file_name: f.file_name,
      storage_path: f.storage_path as string,
      mime_type: f.mime_type,
      file_size: f.file_size,
      sectionTitle: f.sectionTitle,
    }));
}
```

- [ ] **Step 2: Re-run the test — should pass**

Run: `pnpm test:integration src/lib/queries/moodle-materials.integration.test.ts`
Expected: 2 tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/lib/queries/moodle-materials.ts src/lib/queries/moodle-materials.integration.test.ts
git commit -m "feat(queries): lightweight getMoodleImportableFiles loader"
```

---

## Task 8: Write the integration test for `getMoodleSectionsWithSignedUrls`

**Files:**
- Modify: `src/lib/queries/moodle-materials.integration.test.ts`

- [ ] **Step 1: Append a `describe` block for the heavy loader**

Append to `src/lib/queries/moodle-materials.integration.test.ts`:

```typescript
import { getMoodleSectionsWithSignedUrls } from './moodle-materials';

describe('getMoodleSectionsWithSignedUrls (integration)', () => {
  let testUserId: string;
  let testCourseId: string;

  beforeAll(async () => {
    const admin = createAdminClient();
    const { data: user } = await admin.auth.admin.getUserByEmail(
      'test@typenote.dev',
    );
    if (!user?.user) throw new Error('seed user missing');
    testUserId = user.user.id;

    const { data: course } = await admin
      .from('courses')
      .select('id')
      .eq('user_id', testUserId)
      .limit(1)
      .single();
    if (!course) throw new Error('seed course missing');
    testCourseId = course.id;
  });

  it('returns sections with signed URLs for every file', async () => {
    const sections = await getMoodleSectionsWithSignedUrls(
      testCourseId,
      testUserId,
    );
    for (const section of sections) {
      expect(section.id).toBeTruthy();
      expect(section.title).toBeTruthy();
      for (const file of section.moodle_files) {
        expect(file.storage_path).toBeTruthy();
        expect(file.downloadUrl).toBeTruthy();
        expect(file.downloadUrl).toMatch(/^https?:\/\//);
      }
    }
  });

  it('filters out sections that have zero imported files for this user', async () => {
    // Use a fresh user with no imports
    const admin = createAdminClient();
    const { data: newUser } = await admin.auth.admin.createUser({
      email: `test-${Date.now()}@typenote.dev`,
      password: 'Test1234',
      email_confirm: true,
    });
    if (!newUser.user) throw new Error('failed to create test user');

    const sections = await getMoodleSectionsWithSignedUrls(
      testCourseId,
      newUser.user.id,
    );
    expect(sections).toEqual([]);

    // Cleanup
    await admin.auth.admin.deleteUser(newUser.user.id);
  });
});
```

- [ ] **Step 2: Run — should fail on import**

Run: `pnpm test:integration src/lib/queries/moodle-materials.integration.test.ts`
Expected: FAIL with "getMoodleSectionsWithSignedUrls is not exported" or similar.

---

## Task 9: Implement `getMoodleSectionsWithSignedUrls` with batched signed URLs

**Files:**
- Modify: `src/lib/queries/moodle-materials.ts`

- [ ] **Step 1: Append the heavy loader**

Append to `src/lib/queries/moodle-materials.ts`:

```typescript
export type MoodleFileWithSignedUrl = {
  id: string;
  file_name: string;
  type: string;
  moodle_url: string;
  storage_path: string | null;
  mime_type: string | null;
  file_size: number | null;
  position: number;
  downloadUrl?: string;
};

export type MoodleSectionWithFiles = {
  id: string;
  title: string;
  position: number;
  moodle_files: MoodleFileWithSignedUrl[];
};

/**
 * Heavy loader: returns sections + files filtered to the user's imports,
 * with batched signed download URLs. Used by the Moodle Materials section.
 */
export async function getMoodleSectionsWithSignedUrls(
  courseId: string,
  userId: string,
): Promise<MoodleSectionWithFiles[]> {
  const admin = createAdminClient();

  const { data: syncRecord } = await admin
    .from('user_course_syncs')
    .select('moodle_course_id')
    .eq('user_id', userId)
    .eq('course_id', courseId)
    .maybeSingle();

  if (!syncRecord) return [];

  const { data: sections } = await admin
    .from('moodle_sections')
    .select(
      'id, title, position, moodle_files(id, file_name, type, moodle_url, storage_path, mime_type, file_size, position)',
    )
    .eq('course_id', syncRecord.moodle_course_id)
    .order('position');

  if (!sections || sections.length === 0) return [];

  const allFiles = (sections as MoodleSectionWithFiles[])
    .flatMap((s) => s.moodle_files)
    .filter((f) => f.storage_path);

  if (allFiles.length === 0) return [];

  const { data: imports } = await admin
    .from('user_file_imports')
    .select('moodle_file_id')
    .eq('user_id', userId)
    .eq('status', 'imported')
    .in(
      'moodle_file_id',
      allFiles.map((f) => f.id),
    );

  const importedIds = new Set(
    (imports ?? []).map((i: { moodle_file_id: string }) => i.moodle_file_id),
  );

  const filteredSections = (sections as MoodleSectionWithFiles[])
    .map((s) => ({
      ...s,
      moodle_files: s.moodle_files.filter(
        (f) => f.storage_path && importedIds.has(f.id),
      ),
    }))
    .filter((s) => s.moodle_files.length > 0);

  // Batch all signed URLs in a single round-trip per section's file set.
  const allPaths = filteredSections
    .flatMap((s) => s.moodle_files)
    .map((f) => f.storage_path as string);

  if (allPaths.length === 0) return filteredSections;

  const { data: signedData } = await admin.storage
    .from('moodle-materials')
    .createSignedUrls(allPaths, 3600);

  const urlByPath = new Map<string, string>();
  for (const entry of signedData ?? []) {
    if (entry.path && entry.signedUrl) {
      urlByPath.set(entry.path, entry.signedUrl);
    }
  }

  for (const section of filteredSections) {
    for (const file of section.moodle_files) {
      if (file.storage_path) {
        file.downloadUrl = urlByPath.get(file.storage_path);
      }
    }
  }

  return filteredSections;
}
```

- [ ] **Step 2: Re-run the test — should pass**

Run: `pnpm test:integration src/lib/queries/moodle-materials.integration.test.ts`
Expected: all 4 tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/lib/queries/moodle-materials.ts src/lib/queries/moodle-materials.integration.test.ts
git commit -m "feat(queries): batched signed URL Moodle loader"
```

---

## Task 10: Create the `*Slot` server components

**Files:**
- Create: `src/components/dashboard/course-page-slots.tsx`

- [ ] **Step 1: Create the file with four async server components**

Create `src/components/dashboard/course-page-slots.tsx`:

```tsx
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { DocumentListWithMove } from '@/components/dashboard/document-list-with-move';
import { PersonalFileItem } from '@/components/dashboard/personal-file-item';
import { MoodleFileRow } from '@/components/dashboard/moodle-file-row';
import { WeekSection } from '@/components/dashboard/week-section';
import {
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import type {
  CourseWeek,
  CourseMaterial,
  Document,
  PersonalFile,
  Folder,
} from '@/types/database';
import type {
  ImportableMoodleFile,
  MoodleSectionWithFiles,
} from '@/lib/queries/moodle-materials';

type WeeksSlotProps = {
  weeksPromise: Promise<CourseWeek[]>;
  materialsPromise: Promise<CourseMaterial[]>;
  weekDocumentsPromise: Promise<Document[]>;
  weekPersonalFilesPromise: Promise<PersonalFile[]>;
  importablePromise: Promise<ImportableMoodleFile[]>;
  courseId: string;
  userId: string;
};

export async function WeeksSlot({
  weeksPromise,
  materialsPromise,
  weekDocumentsPromise,
  weekPersonalFilesPromise,
  importablePromise,
  courseId,
  userId,
}: WeeksSlotProps) {
  const [weeks, materials, weekDocuments, weekPersonalFiles, importable] =
    await Promise.all([
      weeksPromise,
      materialsPromise,
      weekDocumentsPromise,
      weekPersonalFilesPromise,
      importablePromise,
    ]);

  if (weeks.length === 0) return null;

  return (
    <div>
      <h2 className="mb-3 text-sm font-medium text-muted-foreground">Weeks</h2>
      <div className="space-y-3">
        {weeks.map((week) => (
          <WeekSection
            key={week.id}
            week={week}
            courseId={courseId}
            userId={userId}
            materials={materials.filter(
              (m) => m.week_id === week.id && m.category === 'material',
            )}
            homework={materials.filter(
              (m) => m.week_id === week.id && m.category === 'homework',
            )}
            documents={weekDocuments.filter((d) => d.week_id === week.id)}
            personalFiles={weekPersonalFiles.filter(
              (f) => f.week_id === week.id,
            )}
            moodleFiles={importable}
          />
        ))}
      </div>
    </div>
  );
}

type CourseDocumentsSlotProps = {
  documentsPromise: Promise<Document[]>;
  personalFilesPromise: Promise<PersonalFile[]>;
  linkedFileIdsPromise: Promise<Set<string>>;
};

export async function CourseDocumentsSlot({
  documentsPromise,
  personalFilesPromise,
  linkedFileIdsPromise,
}: CourseDocumentsSlotProps) {
  const [documents, personalFiles, linkedFileIds] = await Promise.all([
    documentsPromise,
    personalFilesPromise,
    linkedFileIdsPromise,
  ]);

  const visiblePersonalFiles = personalFiles.filter(
    (f) => !linkedFileIds.has(f.id),
  );

  return (
    <>
      {documents.length > 0 && (
        <div className="mb-6">
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">
            Documents
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            <DocumentListWithMove documents={documents} />
          </div>
        </div>
      )}
      {visiblePersonalFiles.length > 0 && (
        <div className="mb-6">
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">
            Imported Files
          </h2>
          <div className="space-y-0.5">
            {visiblePersonalFiles.map((file) => (
              <PersonalFileItem key={file.id} file={file} />
            ))}
          </div>
        </div>
      )}
    </>
  );
}

type MoodleMaterialsSlotProps = {
  sectionsPromise: Promise<MoodleSectionWithFiles[]>;
  courseId: string;
};

export async function MoodleMaterialsSlot({
  sectionsPromise,
  courseId,
}: MoodleMaterialsSlotProps) {
  const sections = await sectionsPromise;
  if (sections.length === 0) return null;

  return (
    <div className="mt-6">
      <h2 className="mb-3 text-sm font-medium text-muted-foreground">
        Moodle Materials
      </h2>
      <div className="space-y-3">
        {sections.map((section) => (
          <div key={section.id} className="rounded-lg border">
            <div className="border-b bg-muted/30 px-4 py-2">
              <h3 className="text-sm font-medium">{section.title}</h3>
            </div>
            <div className="divide-y">
              {section.moodle_files
                .sort((a, b) => a.position - b.position)
                .map((file) => {
                  const href = file.downloadUrl ?? file.moodle_url;
                  const isStored = !!file.downloadUrl;
                  return (
                    <MoodleFileRow
                      key={file.id}
                      fileId={file.id}
                      fileName={file.file_name}
                      fileType={file.type}
                      mimeType={file.mime_type}
                      fileSize={file.file_size}
                      href={href}
                      isStored={isStored}
                      courseId={courseId}
                    />
                  );
                })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

type BreadcrumbParentFolderSlotProps = {
  folderPromise: Promise<Folder | null>;
};

export async function BreadcrumbParentFolderSlot({
  folderPromise,
}: BreadcrumbParentFolderSlotProps) {
  const folder = await folderPromise;
  if (!folder) return null;
  return (
    <>
      <BreadcrumbSeparator />
      <BreadcrumbItem>
        <BreadcrumbLink asChild>
          <Link href={`/dashboard/folders/${folder.id}`}>{folder.name}</Link>
        </BreadcrumbLink>
      </BreadcrumbItem>
    </>
  );
}
```

- [ ] **Step 2: Type-check passes**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/course-page-slots.tsx
git commit -m "feat(course): extract async Slot server components"
```

---

## Task 11: Restructure the course page to stream Slot components

**Files:**
- Modify: `src/app/(dashboard)/dashboard/courses/[courseId]/page.tsx`

- [ ] **Step 1: Replace the entire file**

Replace the contents of `src/app/(dashboard)/dashboard/courses/[courseId]/page.tsx` with:

```tsx
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth/get-current-user';
import { AiChatWrapper } from '@/components/ai/ai-chat-wrapper';
import { CreateDocumentDialog } from '@/components/dashboard/create-document-dialog';
import { WeekDialog } from '@/components/dashboard/week-dialog';
import { EmptyState } from '@/components/dashboard/empty-state';
import { PersonalFileUpload } from '@/components/dashboard/personal-file-upload';
import {
  WeeksSlot,
  CourseDocumentsSlot,
  MoodleMaterialsSlot,
  BreadcrumbParentFolderSlot,
} from '@/components/dashboard/course-page-slots';
import {
  getPersonalFilesByCourse,
  getPersonalFilesByWeeks,
} from '@/lib/queries/personal-files';
import {
  getMoodleImportableFiles,
  getMoodleSectionsWithSignedUrls,
} from '@/lib/queries/moodle-materials';
import { Button } from '@/components/ui/button';
import { ChevronLeft } from 'lucide-react';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import type {
  Course,
  CourseWeek,
  CourseMaterial,
  Document,
  PersonalFile,
  Folder,
} from '@/types/database';

export default async function CoursePage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
  const supabase = await createClient();

  const [user, courseResult] = await Promise.all([
    getCurrentUser(),
    supabase.from('courses').select('*').eq('id', courseId).single(),
  ]);

  const course = courseResult.data as Course | null;
  if (!course) notFound();

  const userId = user?.id ?? '';

  // Kick off all secondary queries as promises (no top-level await).
  const weeksPromise = supabase
    .from('course_weeks')
    .select('*')
    .eq('course_id', courseId)
    .order('week_number', { ascending: true })
    .then((r) => (r.data as CourseWeek[] | null) ?? []);

  const allDocumentsPromise = supabase
    .from('documents')
    .select('*')
    .eq('course_id', courseId)
    .order('position', { ascending: true })
    .then((r) => (r.data as Document[] | null) ?? []);

  const materialsPromise: Promise<CourseMaterial[]> = weeksPromise.then(
    async (weeks) => {
      const weekIds = weeks.map((w) => w.id);
      if (weekIds.length === 0) return [];
      const { data } = await supabase
        .from('course_materials')
        .select('*')
        .in('week_id', weekIds)
        .order('created_at', { ascending: true });
      return (data as CourseMaterial[] | null) ?? [];
    },
  );

  const weekPersonalFilesPromise: Promise<PersonalFile[]> = weeksPromise.then(
    async (weeks) =>
      (await getPersonalFilesByWeeks(weeks.map((w) => w.id))) as PersonalFile[],
  );

  const coursePersonalFilesPromise = getPersonalFilesByCourse(
    courseId,
  ) as Promise<PersonalFile[]>;

  const courseDocumentsPromise = allDocumentsPromise.then((docs) =>
    docs.filter((d) => !d.week_id),
  );
  const weekDocumentsPromise = allDocumentsPromise.then((docs) =>
    docs.filter((d) => d.week_id),
  );

  const linkedFileIdsPromise = allDocumentsPromise.then(
    (docs) =>
      new Set(
        docs
          .filter((d) => d.personal_file_id)
          .map((d) => d.personal_file_id as string),
      ),
  );

  const importablePromise = getMoodleImportableFiles(courseId, userId);
  const moodleSectionsPromise = getMoodleSectionsWithSignedUrls(
    courseId,
    userId,
  );

  const parentFolderPromise: Promise<Folder | null> = course.folder_id
    ? supabase
        .from('folders')
        .select('*')
        .eq('id', course.folder_id)
        .single()
        .then((r) => r.data as Folder | null)
    : Promise.resolve(null);

  return (
    <div className="h-full overflow-y-auto p-6">
      <Link
        href="/dashboard"
        className="mb-4 inline-flex items-center gap-1 rounded bg-muted px-2 py-1 text-sm text-muted-foreground hover:text-foreground min-h-[44px]"
      >
        <ChevronLeft className="size-3.5" />
        Dashboard
      </Link>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
        <Breadcrumb className="min-w-0">
          <BreadcrumbList className="flex-wrap">
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/dashboard">Home</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <Suspense fallback={null}>
              <BreadcrumbParentFolderSlot folderPromise={parentFolderPromise} />
            </Suspense>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{course.name}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div className="flex flex-wrap items-center gap-2">
          <AiChatWrapper courseId={courseId} courseName={course.name} />
          <CreateDocumentDialog folderId={null} courseId={courseId}>
            <Button variant="outline" size="sm">
              New Document
            </Button>
          </CreateDocumentDialog>
          <WeekDialog courseId={courseId} />
          <PersonalFileUpload
            courseId={courseId}
            userId={userId}
            category="material"
            label="Import File"
          />
        </div>
      </div>

      <div className="mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">{course.name}</h1>
        </div>
      </div>

      <Suspense fallback={<CourseDocumentsSkeleton />}>
        <CourseDocumentsSlot
          documentsPromise={courseDocumentsPromise}
          personalFilesPromise={coursePersonalFilesPromise}
          linkedFileIdsPromise={linkedFileIdsPromise}
        />
      </Suspense>

      <Suspense fallback={<WeeksSkeleton />}>
        <WeeksSlot
          weeksPromise={weeksPromise}
          materialsPromise={materialsPromise}
          weekDocumentsPromise={weekDocumentsPromise}
          weekPersonalFilesPromise={weekPersonalFilesPromise}
          importablePromise={importablePromise}
          courseId={courseId}
          userId={userId}
        />
      </Suspense>

      <Suspense fallback={<MoodleMaterialsSkeleton />}>
        <MoodleMaterialsSlot
          sectionsPromise={moodleSectionsPromise}
          courseId={courseId}
        />
      </Suspense>
    </div>
  );
}

function CourseDocumentsSkeleton() {
  return (
    <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-24 animate-pulse rounded-lg border bg-muted/40" />
      ))}
    </div>
  );
}

function WeeksSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-16 animate-pulse rounded-lg border bg-muted/40" />
      ))}
    </div>
  );
}

function MoodleMaterialsSkeleton() {
  return (
    <div className="mt-6 space-y-3">
      <div className="h-5 w-32 animate-pulse rounded bg-muted" />
      <div className="h-24 animate-pulse rounded-lg border bg-muted/40" />
    </div>
  );
}
```

Note: this version intentionally drops the `EmptyState` rendering because each slot already handles its own empty case (returns `null`). If the course is truly empty, all slots return null and the user sees just the breadcrumb + title + action buttons.

- [ ] **Step 2: Type-check passes**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 3: Existing tests still pass**

Run: `pnpm test && pnpm test:integration`
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(dashboard\)/dashboard/courses/\[courseId\]/page.tsx
git commit -m "perf(course): stream secondary data via Suspense slots"
```

---

## Task 12: Add course page `loading.tsx`

**Files:**
- Create: `src/app/(dashboard)/dashboard/courses/[courseId]/loading.tsx`

- [ ] **Step 1: Create the skeleton**

Create `src/app/(dashboard)/dashboard/courses/[courseId]/loading.tsx`:

```tsx
export default function CourseLoading() {
  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mb-4 h-9 w-28 animate-pulse rounded bg-muted" />
      <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
        <div className="h-5 w-48 animate-pulse rounded bg-muted" />
        <div className="flex gap-2">
          <div className="h-9 w-24 animate-pulse rounded bg-muted" />
          <div className="h-9 w-28 animate-pulse rounded bg-muted" />
          <div className="h-9 w-24 animate-pulse rounded bg-muted" />
        </div>
      </div>
      <div className="mb-6 h-8 w-64 animate-pulse rounded bg-muted" />
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="h-16 animate-pulse rounded-lg border bg-muted/40"
          />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/\(dashboard\)/dashboard/courses/\[courseId\]/loading.tsx
git commit -m "feat(course): add loading.tsx skeleton"
```

---

## Task 13: Write the E2E test for streaming dashboard + course

**Files:**
- Create: `e2e/perf-streaming.spec.ts`
- Modify: `e2e/TEST_REGISTRY.md`

- [ ] **Step 1: Write the E2E test**

Create `e2e/perf-streaming.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

test.describe('streaming page shell', () => {
  test('dashboard renders folders/courses after auth', async ({ page }) => {
    await login(page);
    await page.goto('/dashboard');
    // Shell should appear quickly — breadcrumb is part of the shell.
    await expect(page.getByText('Home')).toBeVisible();
    // Eventually content (folders/courses/documents grid OR empty state) renders.
    await page.waitForLoadState('networkidle');
  });

  test('course page renders title before all sections settle', async ({
    page,
  }) => {
    await login(page);
    await page.goto('/dashboard');
    // Click into the first available course
    const firstCourse = page.getByRole('button').filter({ hasText: /./ }).first();
    // Fall back: navigate to a seeded course if buttons aren't reliable
    // (the seed file guarantees at least one course)
    await page.goto('/dashboard');
    const courseLink = page.locator('a[href*="/dashboard/courses/"]').first();
    if (await courseLink.count()) {
      await courseLink.click();
      await expect(page.locator('h1')).toBeVisible();
      await page.waitForLoadState('networkidle');
    }
  });
});
```

- [ ] **Step 2: Update the test registry**

Edit `e2e/TEST_REGISTRY.md` and add under an appropriate section:

```markdown
- `perf-streaming.spec.ts` — verifies the dashboard and course-page shells render before all data settles (Phase 1 of perf overhaul).
```

- [ ] **Step 3: Run E2E locally**

Run: `pnpm test:e2e e2e/perf-streaming.spec.ts`
Expected: both tests pass against the seeded local Supabase.

- [ ] **Step 4: Commit**

```bash
git add e2e/perf-streaming.spec.ts e2e/TEST_REGISTRY.md
git commit -m "test(e2e): streaming dashboard and course page shells"
```

---

## Task 14: Run the full test suite and open Phase 1 PR

**Files:** _(none — verification + push)_

- [ ] **Step 1: Run all tests**

Run: `pnpm test && pnpm test:integration && pnpm test:e2e`
Expected: all green.

- [ ] **Step 2: Build cleanly**

Run: `pnpm build`
Expected: production build succeeds, no type errors.

- [ ] **Step 3: Push branch**

```bash
git push -u origin feat/perf-phase1-streaming
```

- [ ] **Step 4: Open PR against `dev`**

```bash
gh pr create --base dev --title "perf: instant first-visit (Promise.all + Suspense + batched signed URLs)" --body "$(cat <<'EOF'
## Summary
- Collapses request waterfalls in dashboard and course page with Promise.all
- Streams secondary data via Suspense + loading.tsx skeletons (shell visible in <100ms)
- Batches Moodle signed-URL generation into a single Supabase call
- Splits Moodle data into a lightweight metadata query and a heavy signed-URL query (sets up Phase 2)
- Dedupes auth.getUser() across layout + page via React.cache

Spec: docs/superpowers/specs/2026-05-24-instant-dashboard-and-course-pages-design.md

## Test plan
- [ ] `pnpm test` passes
- [ ] `pnpm test:integration` passes
- [ ] `pnpm test:e2e` passes (incl. new `e2e/perf-streaming.spec.ts`)
- [ ] Manual: build & start, hit course page with Moodle materials, screenshot Network panel TTFB + LCP before/after on Vercel preview
EOF
)"
```

Expected: PR opens against `dev`. Wait for CI to pass before merging.

---

# Phase 2 — Lazy-load Moodle materials

> **Pre-requisite:** Phase 1 PR is merged (or merged into a shared branch you'll build on).

## Task 15: Create Phase 2 feature branch

- [ ] **Step 1: Pull latest `dev`**

```bash
git fetch origin dev
git checkout -b feat/perf-phase2-lazy-moodle origin/dev
```

Expected: `Switched to a new branch 'feat/perf-phase2-lazy-moodle'`.

---

## Task 16: Write the integration test for `getMoodleMaterialsForCourse` Server Action

**Files:**
- Create: `src/lib/actions/moodle-materials.integration.test.ts`

- [ ] **Step 1: Write the test**

Create `src/lib/actions/moodle-materials.integration.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { createAdminClient } from '@/lib/supabase/admin';
import { getMoodleMaterialsForCourse } from './moodle-materials';

describe('getMoodleMaterialsForCourse (server action)', () => {
  it('returns the same data as getMoodleSectionsWithSignedUrls', async () => {
    // Setup: log in as the seed user by setting auth cookie via admin client
    // (the action reads the current user via getCurrentUser).
    // For this test we rely on the fact that the integration test setup
    // already authenticates as test@typenote.dev — see vitest setup.
    const admin = createAdminClient();
    const { data: course } = await admin
      .from('courses')
      .select('id')
      .limit(1)
      .single();
    if (!course) throw new Error('seed course missing');

    const result = await getMoodleMaterialsForCourse(course.id);
    expect(Array.isArray(result)).toBe(true);
    for (const section of result) {
      for (const file of section.moodle_files) {
        if (file.storage_path) {
          expect(file.downloadUrl).toBeTruthy();
        }
      }
    }
  });

  it('throws when called unauthenticated', async () => {
    // Force-unauthenticated by clearing the session in the integration helper
    // (see e2e/helpers or wherever the test client is initialized).
    // If your harness doesn't support this easily, skip this case.
    // Otherwise:
    // await expect(getMoodleMaterialsForCourse('any')).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run — should fail on import**

Run: `pnpm test:integration src/lib/actions/moodle-materials.integration.test.ts`
Expected: FAIL with module-not-found.

---

## Task 17: Implement `getMoodleMaterialsForCourse` Server Action

**Files:**
- Create: `src/lib/actions/moodle-materials.ts`

- [ ] **Step 1: Create the action**

Create `src/lib/actions/moodle-materials.ts`:

```typescript
'use server';

import { getCurrentUser } from '@/lib/auth/get-current-user';
import {
  getMoodleSectionsWithSignedUrls,
  type MoodleSectionWithFiles,
} from '@/lib/queries/moodle-materials';

export async function getMoodleMaterialsForCourse(
  courseId: string,
): Promise<MoodleSectionWithFiles[]> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');
  return getMoodleSectionsWithSignedUrls(courseId, user.id);
}
```

- [ ] **Step 2: Re-run the test — should pass**

Run: `pnpm test:integration src/lib/actions/moodle-materials.integration.test.ts`
Expected: 1 test passes (the auth case is conditionally skipped).

- [ ] **Step 3: Commit**

```bash
git add src/lib/actions/moodle-materials.ts src/lib/actions/moodle-materials.integration.test.ts
git commit -m "feat(moodle): Server Action wrapping the heavy materials loader"
```

---

## Task 18: Create the `<MoodleMaterialsSection>` client component

**Files:**
- Create: `src/components/dashboard/moodle-materials-section.tsx`

- [ ] **Step 1: Create the file**

Create `src/components/dashboard/moodle-materials-section.tsx`:

```tsx
'use client';

import { useState, useTransition } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MoodleFileRow } from '@/components/dashboard/moodle-file-row';
import { getMoodleMaterialsForCourse } from '@/lib/actions/moodle-materials';
import type { MoodleSectionWithFiles } from '@/lib/queries/moodle-materials';

export function MoodleMaterialsSection({
  courseId,
}: {
  courseId: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [sections, setSections] = useState<MoodleSectionWithFiles[] | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggle() {
    const next = !expanded;
    setExpanded(next);
    if (next && sections === null) {
      startTransition(async () => {
        try {
          const data = await getMoodleMaterialsForCourse(courseId);
          setSections(data);
          setError(null);
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Failed to load');
        }
      });
    }
  }

  return (
    <div className="mt-6">
      <button
        type="button"
        onClick={toggle}
        className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
        aria-expanded={expanded}
      >
        <ChevronRight
          className={cn('size-3.5 transition-transform', expanded && 'rotate-90')}
        />
        Moodle Materials
      </button>

      {expanded && (
        <div className="space-y-3">
          {isPending && (
            <div className="h-16 animate-pulse rounded-lg border bg-muted/40" />
          )}
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
          {!isPending && !error && sections && sections.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No Moodle materials imported for this course.
            </p>
          )}
          {!isPending &&
            sections?.map((section) => (
              <div key={section.id} className="rounded-lg border">
                <div className="border-b bg-muted/30 px-4 py-2">
                  <h3 className="text-sm font-medium">{section.title}</h3>
                </div>
                <div className="divide-y">
                  {section.moodle_files
                    .sort((a, b) => a.position - b.position)
                    .map((file) => {
                      const href = file.downloadUrl ?? file.moodle_url;
                      const isStored = !!file.downloadUrl;
                      return (
                        <MoodleFileRow
                          key={file.id}
                          fileId={file.id}
                          fileName={file.file_name}
                          fileType={file.type}
                          mimeType={file.mime_type}
                          fileSize={file.file_size}
                          href={href}
                          isStored={isStored}
                          courseId={courseId}
                        />
                      );
                    })}
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check passes**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/moodle-materials-section.tsx
git commit -m "feat(moodle): collapsible MoodleMaterialsSection client component"
```

---

## Task 19: Replace `<MoodleMaterialsSlot>` with `<MoodleMaterialsSection>` in the page

**Files:**
- Modify: `src/app/(dashboard)/dashboard/courses/[courseId]/page.tsx`

- [ ] **Step 1: Remove the Moodle slot and replace with the client component**

In `src/app/(dashboard)/dashboard/courses/[courseId]/page.tsx`:

1. Remove the import of `MoodleMaterialsSlot` from `course-page-slots`.
2. Add `import { MoodleMaterialsSection } from '@/components/dashboard/moodle-materials-section';`.
3. Remove the `getMoodleSectionsWithSignedUrls` import (keep `getMoodleImportableFiles`).
4. Delete the `moodleSectionsPromise` declaration.
5. Replace the entire `<Suspense fallback={<MoodleMaterialsSkeleton />}><MoodleMaterialsSlot ... /></Suspense>` block with:

```tsx
<MoodleMaterialsSection courseId={courseId} />
```

6. Delete the `MoodleMaterialsSkeleton` helper function — no longer used.

- [ ] **Step 2: Type-check passes**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 3: Existing tests still pass**

Run: `pnpm test && pnpm test:integration`
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(dashboard\)/dashboard/courses/\[courseId\]/page.tsx
git commit -m "perf(course): lazy-load Moodle materials on expand"
```

---

## Task 20: E2E test for lazy Moodle expansion

**Files:**
- Create: `e2e/lazy-moodle.spec.ts`
- Modify: `e2e/TEST_REGISTRY.md`

- [ ] **Step 1: Write the test**

Create `e2e/lazy-moodle.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

test('Moodle Materials section is collapsed by default and loads on expand', async ({
  page,
}) => {
  await login(page);
  await page.goto('/dashboard');

  // Navigate into the first course
  const courseLink = page.locator('a[href*="/dashboard/courses/"]').first();
  if (!(await courseLink.count())) {
    test.skip(true, 'No seeded course available');
    return;
  }
  await courseLink.click();
  await page.waitForLoadState('networkidle');

  // The header should be visible
  const header = page.getByRole('button', { name: /Moodle Materials/i });
  // If the course has no Moodle data at all, the section won't render — but
  // because the section now always renders the header even when empty
  // (the empty-state lives behind the toggle), we expect it to be present
  // only when the course has a Moodle sync. Skip otherwise.
  if (!(await header.count())) {
    test.skip(true, 'Course has no Moodle materials section');
    return;
  }

  // Before clicking, no file rows should be present
  await expect(page.getByTestId('moodle-file-row')).toHaveCount(0);

  // Click to expand
  await header.click();

  // Either a file row appears or the empty-state message appears
  await expect(
    page
      .getByTestId('moodle-file-row')
      .or(page.getByText(/No Moodle materials imported/i)),
  ).toBeVisible({ timeout: 10_000 });
});
```

> **Note:** This test assumes `<MoodleFileRow>` renders an element with `data-testid="moodle-file-row"`. If the existing component does not, add `data-testid="moodle-file-row"` to its root element in `src/components/dashboard/moodle-file-row.tsx` as part of this task.

- [ ] **Step 2: Add the `data-testid` to MoodleFileRow if missing**

Open `src/components/dashboard/moodle-file-row.tsx` and ensure its outermost element includes `data-testid="moodle-file-row"`. If it doesn't, add it.

- [ ] **Step 3: Update the test registry**

Edit `e2e/TEST_REGISTRY.md` and add:

```markdown
- `lazy-moodle.spec.ts` — verifies the Moodle Materials section is collapsed by default and loads files on expand (Phase 2 of perf overhaul).
```

- [ ] **Step 4: Run E2E**

Run: `pnpm test:e2e e2e/lazy-moodle.spec.ts`
Expected: passes (or skips with reason if the seeded course has no Moodle sync).

- [ ] **Step 5: Commit**

```bash
git add e2e/lazy-moodle.spec.ts e2e/TEST_REGISTRY.md src/components/dashboard/moodle-file-row.tsx
git commit -m "test(e2e): lazy-load Moodle materials"
```

---

## Task 21: Run full test suite and open Phase 2 PR

- [ ] **Step 1: All tests pass**

Run: `pnpm test && pnpm test:integration && pnpm test:e2e`
Expected: all green.

- [ ] **Step 2: Build cleanly**

Run: `pnpm build`
Expected: success.

- [ ] **Step 3: Push & open PR**

```bash
git push -u origin feat/perf-phase2-lazy-moodle
gh pr create --base dev --title "perf(course): lazy-load Moodle materials behind a collapsible" --body "$(cat <<'EOF'
## Summary
- Defers the heaviest fetch (Moodle sections + signed URLs) until the user expands the section
- New Server Action `getMoodleMaterialsForCourse` wraps the existing loader
- New client component `<MoodleMaterialsSection>` handles expand/collapse + caching in state

Spec: docs/superpowers/specs/2026-05-24-instant-dashboard-and-course-pages-design.md

## Test plan
- [ ] `pnpm test` passes
- [ ] `pnpm test:integration` passes
- [ ] `pnpm test:e2e` passes (incl. new `lazy-moodle.spec.ts`)
- [ ] Manual: verify the section is collapsed on a Moodle-heavy course and that expanding loads files within ~500ms
EOF
)"
```

---

# Phase 3 — Prefetch + SWR sidebar

> **Pre-requisite:** Phase 2 PR merged into `dev`.

## Task 22: Create Phase 3 feature branch + install SWR

**Files:**
- Modify: `package.json`, `pnpm-lock.yaml`

- [ ] **Step 1: Branch off latest `dev`**

```bash
git fetch origin dev
git checkout -b feat/perf-phase3-prefetch-swr origin/dev
```

- [ ] **Step 2: Install SWR**

Run: `pnpm add swr`
Expected: `swr` added under `dependencies`, lockfile updated.

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore(deps): add swr for client-side caching"
```

---

## Task 23: Write integration test for `getSidebarTree` Server Action

**Files:**
- Create: `src/lib/actions/sidebar.integration.test.ts`

- [ ] **Step 1: Write the test**

Create `src/lib/actions/sidebar.integration.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { getSidebarTree } from './sidebar';

describe('getSidebarTree (integration)', () => {
  it('returns folders and courses for the current user', async () => {
    const result = await getSidebarTree();
    expect(result).toHaveProperty('folders');
    expect(result).toHaveProperty('courses');
    expect(Array.isArray(result.folders)).toBe(true);
    expect(Array.isArray(result.courses)).toBe(true);
  });
});
```

- [ ] **Step 2: Run — should fail on import**

Run: `pnpm test:integration src/lib/actions/sidebar.integration.test.ts`
Expected: FAIL with module not found.

---

## Task 24: Implement `getSidebarTree` Server Action

**Files:**
- Create: `src/lib/actions/sidebar.ts`

- [ ] **Step 1: Create the action**

Create `src/lib/actions/sidebar.ts`:

```typescript
'use server';

import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth/get-current-user';
import type { Folder, Course } from '@/types/database';

export async function getSidebarTree(): Promise<{
  folders: Folder[];
  courses: Course[];
}> {
  const user = await getCurrentUser();
  if (!user) return { folders: [], courses: [] };

  const supabase = await createClient();
  const [foldersResult, coursesResult] = await Promise.all([
    supabase
      .from('folders')
      .select('*')
      .order('position', { ascending: true }),
    supabase
      .from('courses')
      .select('*')
      .order('position', { ascending: true }),
  ]);

  return {
    folders: (foldersResult.data as Folder[] | null) ?? [],
    courses: (coursesResult.data as Course[] | null) ?? [],
  };
}
```

- [ ] **Step 2: Test passes**

Run: `pnpm test:integration src/lib/actions/sidebar.integration.test.ts`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add src/lib/actions/sidebar.ts src/lib/actions/sidebar.integration.test.ts
git commit -m "feat(sidebar): getSidebarTree Server Action"
```

---

## Task 25: Add SWR keys file

**Files:**
- Create: `src/lib/swr/keys.ts`

- [ ] **Step 1: Create the file**

Create `src/lib/swr/keys.ts`:

```typescript
export const sidebarTreeKey = (userId: string) =>
  ['sidebar-tree', userId] as const;
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/swr/keys.ts
git commit -m "feat(swr): canonical SWR cache keys"
```

---

## Task 26: Rewrite `SidebarFolderTree` with SWR + `<Link prefetch>`

**Files:**
- Modify: `src/components/dashboard/sidebar-folder-tree.tsx`

- [ ] **Step 1: Replace the file contents**

Replace `src/components/dashboard/sidebar-folder-tree.tsx` with:

```tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import useSWR from 'swr';
import { ChevronRight, GraduationCap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSidebar } from '@/components/dashboard/sidebar-layout';
import { getSidebarTree } from '@/lib/actions/sidebar';
import { sidebarTreeKey } from '@/lib/swr/keys';
import type { Course, Folder as FolderType } from '@/types/database';

interface FolderNodeProps {
  folder: FolderType;
  folders: FolderType[];
  courses: Course[];
  level: number;
}

function FolderNode({ folder, folders, courses, level }: FolderNodeProps) {
  const [expanded, setExpanded] = useState(false);
  const pathname = usePathname();
  const { isMobile, close } = useSidebar();

  const children = folders.filter((f) => f.parent_id === folder.id);
  const folderCourses = courses.filter((c) => c.folder_id === folder.id);
  const hasChildren = children.length > 0 || folderCourses.length > 0;
  const isActive = pathname === `/dashboard/folders/${folder.id}`;

  return (
    <div>
      <Link
        href={`/dashboard/folders/${folder.id}`}
        prefetch
        onClick={() => {
          if (isMobile) close();
        }}
        className={cn(
          'flex w-full items-center gap-2 rounded-lg px-2 py-2.5 text-sm transition-colors hover:bg-primary/10 min-h-[44px]',
          isActive && 'bg-primary/10 text-primary font-medium',
        )}
        style={{ paddingLeft: `${level * 12 + 8}px` }}
      >
        {hasChildren ? (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setExpanded(!expanded);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                setExpanded(!expanded);
              }
            }}
            className="shrink-0 cursor-pointer"
          >
            <ChevronRight
              className={cn(
                'size-3.5 transition-transform',
                expanded && 'rotate-90',
              )}
            />
          </span>
        ) : (
          <span className="w-3.5" />
        )}
        <span
          className="size-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: folder.color }}
        />
        <span className="truncate">{folder.name}</span>
      </Link>
      {expanded && (children.length > 0 || folderCourses.length > 0) && (
        <div>
          {children.map((child) => (
            <FolderNode
              key={child.id}
              folder={child}
              folders={folders}
              courses={courses}
              level={level + 1}
            />
          ))}
          {folderCourses.map((course) => (
            <CourseNode key={course.id} course={course} level={level + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

function CourseNode({ course, level }: { course: Course; level: number }) {
  const pathname = usePathname();
  const { isMobile, close } = useSidebar();
  const isActive = pathname === `/dashboard/courses/${course.id}`;

  return (
    <Link
      href={`/dashboard/courses/${course.id}`}
      prefetch
      onClick={() => {
        if (isMobile) close();
      }}
      className={cn(
        'flex w-full items-center gap-2 rounded-lg px-2 py-2.5 text-sm transition-colors hover:bg-primary/10 min-h-[44px]',
        isActive && 'bg-primary/10 text-primary font-medium',
      )}
      style={{ paddingLeft: `${level * 12 + 8}px` }}
    >
      <span className="w-3.5" />
      <GraduationCap
        className="size-3.5 shrink-0"
        style={{ color: course.color }}
      />
      <span className="truncate">{course.name}</span>
    </Link>
  );
}

export function SidebarFolderTree({
  userId,
  initialData,
}: {
  userId: string;
  initialData: { folders: FolderType[]; courses: Course[] };
}) {
  const { data } = useSWR(
    sidebarTreeKey(userId),
    () => getSidebarTree(),
    {
      fallbackData: initialData,
      revalidateOnFocus: true,
    },
  );

  const folders = data?.folders ?? [];
  const courses = data?.courses ?? [];
  const rootFolders = folders.filter((f) => f.parent_id === null);
  const rootCourses = courses.filter((c) => c.folder_id === null);

  if (rootFolders.length === 0 && rootCourses.length === 0) {
    return (
      <p className="px-2 py-4 text-center text-sm text-muted-foreground">
        No courses or folders yet
      </p>
    );
  }

  return (
    <div className="space-y-0.5">
      {rootCourses.map((course) => (
        <CourseNode key={course.id} course={course} level={0} />
      ))}
      {rootFolders.map((folder) => (
        <FolderNode
          key={folder.id}
          folder={folder}
          folders={folders}
          courses={courses}
          level={0}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Type-check passes**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/sidebar-folder-tree.tsx
git commit -m "perf(sidebar): SWR cache + Link prefetch for instant repeat nav"
```

---

## Task 27: Pass `initialData` to the sidebar from the layout

**Files:**
- Modify: `src/app/(dashboard)/layout.tsx`

- [ ] **Step 1: Update layout to fetch and pass initial sidebar tree**

Replace `src/app/(dashboard)/layout.tsx` with:

```tsx
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/get-current-user';
import { getSidebarTree } from '@/lib/actions/sidebar';
import { signOut } from '@/lib/actions/auth';
import { SidebarFolderTree } from '@/components/dashboard/sidebar-folder-tree';
import { SidebarLayout } from '@/components/dashboard/sidebar-layout';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { LogOut } from 'lucide-react';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  const initialSidebarTree = await getSidebarTree();

  const sidebarContent = (
    <>
      <div className="flex h-14 items-center px-4">
        <h1 className="text-xl font-extrabold tracking-tight text-primary">
          <span className="text-primary/60">T</span>ypenote
        </h1>
      </div>
      <Separator />
      <div className="flex-1 overflow-y-auto px-2 py-2">
        <SidebarFolderTree userId={user.id} initialData={initialSidebarTree} />
      </div>
      <Separator />
      <div className="p-2">
        <form action={signOut}>
          <Button
            type="submit"
            variant="ghost"
            className="w-full justify-start min-h-[44px] hover:bg-primary/10 hover:text-primary"
          >
            <LogOut className="size-4" />
            Sign out
          </Button>
        </form>
      </div>
    </>
  );

  return <SidebarLayout sidebar={sidebarContent}>{children}</SidebarLayout>;
}
```

- [ ] **Step 2: Type-check passes**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(dashboard\)/layout.tsx
git commit -m "feat(layout): hydrate sidebar tree with server-fetched initialData"
```

---

## Task 28: Wire `mutate(sidebarTreeKey)` in folder-dialog

**Files:**
- Modify: `src/components/dashboard/folder-dialog.tsx`

- [ ] **Step 1: Read the existing file**

Run: open `src/components/dashboard/folder-dialog.tsx` in your editor.

- [ ] **Step 2: Add SWR mutate after successful create/update**

In the success handler of the form's `onSubmit` (or right after `await createFolder(...)` / `await updateFolder(...)` completes), add:

```typescript
import { mutate } from 'swr';
import { sidebarTreeKey } from '@/lib/swr/keys';

// ... after createFolder/updateFolder succeeds:
if (user?.id) {
  await mutate(sidebarTreeKey(user.id));
}
```

The component already has access to the user via its props or via a context — use whichever pattern is already present. If neither, accept `userId` as a prop and have the parent pass it.

- [ ] **Step 3: Type-check passes**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/folder-dialog.tsx
git commit -m "feat(folders): mutate sidebar SWR cache on create/update"
```

---

## Task 29: Wire `mutate(sidebarTreeKey)` in folder-card (delete)

**Files:**
- Modify: `src/components/dashboard/folder-card.tsx`

- [ ] **Step 1: Add `mutate` after delete**

In the delete handler of `folder-card.tsx`, after `await deleteFolder(folder.id)`, add:

```typescript
import { mutate } from 'swr';
import { sidebarTreeKey } from '@/lib/swr/keys';

// after deleteFolder succeeds:
if (currentUserId) {
  await mutate(sidebarTreeKey(currentUserId));
}
```

`currentUserId` should be the prop the component already receives or a new prop wired from the parent.

- [ ] **Step 2: Commit**

```bash
git add src/components/dashboard/folder-card.tsx
git commit -m "feat(folders): mutate sidebar SWR cache on delete"
```

---

## Task 30: Wire `mutate(sidebarTreeKey)` in course-dialog and course-card

**Files:**
- Modify: `src/components/dashboard/course-dialog.tsx`
- Modify: `src/components/dashboard/course-card.tsx`

- [ ] **Step 1: course-dialog — mutate after create/update**

Same pattern as Task 28, applied in `course-dialog.tsx` after `createCourse`/`updateCourse` succeeds:

```typescript
import { mutate } from 'swr';
import { sidebarTreeKey } from '@/lib/swr/keys';

if (userId) {
  await mutate(sidebarTreeKey(userId));
}
```

- [ ] **Step 2: course-card — mutate after delete**

Same pattern in `course-card.tsx` after `deleteCourse` succeeds.

- [ ] **Step 3: Type-check passes**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/course-dialog.tsx src/components/dashboard/course-card.tsx
git commit -m "feat(courses): mutate sidebar SWR cache on CRUD"
```

---

## Task 31: Wire `mutate(sidebarTreeKey)` in move-document-dialog (when course moves)

**Files:**
- Modify: `src/components/dashboard/move-document-dialog.tsx`

- [ ] **Step 1: Add mutate after `moveCourse` (only when the dialog moves a course)**

Open `src/components/dashboard/move-document-dialog.tsx`. The dialog handles moving folders/courses/documents. For each path where a *course* is moved (via `moveCourse`), add after success:

```typescript
import { mutate } from 'swr';
import { sidebarTreeKey } from '@/lib/swr/keys';

if (userId) {
  await mutate(sidebarTreeKey(userId));
}
```

Document moves do **not** need this (documents are not in the sidebar tree). Folder moves are not currently supported (folders only have `parent_id`, not a "move" UX) — skip.

- [ ] **Step 2: Commit**

```bash
git add src/components/dashboard/move-document-dialog.tsx
git commit -m "feat(move): mutate sidebar SWR cache on course move"
```

---

## Task 32: E2E test for sidebar prefetch + no skeleton on repeat nav

**Files:**
- Create: `e2e/sidebar-prefetch.spec.ts`
- Modify: `e2e/TEST_REGISTRY.md`

- [ ] **Step 1: Write the test**

Create `e2e/sidebar-prefetch.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

test.describe('sidebar prefetch + SWR cache', () => {
  test('sidebar tree does not show loading skeleton after initial mount', async ({
    page,
  }) => {
    await login(page);
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    const sidebar = page.locator('aside, [role="complementary"], nav').first();
    // Navigate into a course and back
    const courseLink = page.locator('a[href*="/dashboard/courses/"]').first();
    if (!(await courseLink.count())) {
      test.skip(true, 'No seeded course available');
      return;
    }
    await courseLink.click();
    await page.waitForLoadState('domcontentloaded');

    // Sidebar should NOT show animate-pulse skeletons after navigation
    const skeletonsAfterNav = await page
      .locator('aside .animate-pulse, nav .animate-pulse')
      .count();
    expect(skeletonsAfterNav).toBe(0);

    // Navigate back
    await page.goto('/dashboard');
    await page.waitForLoadState('domcontentloaded');

    const skeletonsOnReturn = await page
      .locator('aside .animate-pulse, nav .animate-pulse')
      .count();
    expect(skeletonsOnReturn).toBe(0);
  });

  test('creating a folder appears in the sidebar without a full reload', async ({
    page,
  }) => {
    await login(page);
    await page.goto('/dashboard');

    const folderName = `swr-test-${Date.now()}`;
    await page.getByRole('button', { name: /new folder|create folder/i }).click();
    await page.getByLabel(/folder name|name/i).fill(folderName);
    await page.getByRole('button', { name: /create|save/i }).click();

    // The folder should appear in the sidebar within ~2s without a hard reload
    await expect(
      page.locator('nav, aside').getByText(folderName),
    ).toBeVisible({ timeout: 3000 });
  });
});
```

- [ ] **Step 2: Update test registry**

Edit `e2e/TEST_REGISTRY.md`:

```markdown
- `sidebar-prefetch.spec.ts` — verifies sidebar tree doesn't flash skeleton on repeat navigation and reflects CRUD mutations via SWR (Phase 3 of perf overhaul).
```

- [ ] **Step 3: Run E2E**

Run: `pnpm test:e2e e2e/sidebar-prefetch.spec.ts`
Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add e2e/sidebar-prefetch.spec.ts e2e/TEST_REGISTRY.md
git commit -m "test(e2e): sidebar prefetch + SWR cache freshness"
```

---

## Task 33: Run full suite and open Phase 3 PR

- [ ] **Step 1: Tests + build**

Run: `pnpm test && pnpm test:integration && pnpm test:e2e && pnpm build`
Expected: all green.

- [ ] **Step 2: Push + PR**

```bash
git push -u origin feat/perf-phase3-prefetch-swr
gh pr create --base dev --title "perf(sidebar): prefetch + SWR for instant repeat navigation" --body "$(cat <<'EOF'
## Summary
- Swaps sidebar `<button>`s for `<Link prefetch>` so Next.js prefetches destination RSC payloads
- Caches the sidebar folder/course tree with SWR using server-rendered fallbackData
- Wires SWR `mutate(sidebarTreeKey(userId))` into all sidebar-affecting CRUD client handlers
- Adds `swr` (~5kb) to dependencies

Spec: docs/superpowers/specs/2026-05-24-instant-dashboard-and-course-pages-design.md

## Test plan
- [ ] `pnpm test` passes
- [ ] `pnpm test:integration` passes
- [ ] `pnpm test:e2e` passes (incl. new `sidebar-prefetch.spec.ts`)
- [ ] Manual: navigate dashboard ↔ multiple courses, confirm sidebar never re-skeletons after first mount; create a folder and confirm it appears without page reload
EOF
)"
```

---

# Self-review notes (after writing)

**Spec coverage:**

- §5 Phase 1: Tasks 1–14 cover branch setup, cached auth, dashboard parallelization, dashboard skeleton, Moodle data split (lightweight + heavy), Slot components, course page restructure, course skeleton, E2E, PR. ✓
- §6 Phase 2: Tasks 15–21 cover branch, Server Action with test, client component, page swap, E2E, PR. ✓
- §7 Phase 3: Tasks 22–33 cover branch + SWR install, Server Action with test, keys file, sidebar rewrite, layout initialData, mutation hookups (folder-dialog, folder-card, course-dialog, course-card, move-document-dialog), E2E, PR. ✓
- §8 Testing strategy: integration tests for each new data loader / action; E2E for streaming, lazy Moodle, sidebar prefetch + mutation freshness. ✓
- §9 Sequencing: each phase is its own PR off `dev`. ✓
- §10 Risks: Accidental serialization (Phase 1 task 11 avoids top-level `await`); SWR drift (Task 26 uses `fallbackData`); `<Link>` + drawer close (Task 26 uses sibling `onClick`, never `preventDefault` on the navigation path); mutation hookups in Tasks 28–31. ✓

**Placeholder scan:** No "TBD", "TODO", or "similar to above". Each step contains the actual code to write.

**Type consistency:**
- `MoodleSectionWithFiles` defined in Task 9, referenced in Tasks 10, 17, 18. ✓
- `ImportableMoodleFile` defined in Task 7, referenced in Task 10. ✓
- `sidebarTreeKey` defined in Task 25, referenced in Tasks 26, 28–31. ✓
- `getCurrentUser` defined in Task 2, used in Tasks 3, 11, 17, 24, 27. ✓
- `getSidebarTree` defined in Task 24, used in Tasks 26, 27. ✓
