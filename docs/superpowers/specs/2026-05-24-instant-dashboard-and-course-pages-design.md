# Instant Dashboard and Course Pages — Design Spec

**Date:** 2026-05-24
**Status:** Draft — pending user review
**Scope:** Performance overhaul of `/dashboard` and `/dashboard/courses/[courseId]`

---

## 1. Problem

Both the dashboard and course pages feel slow to load in production. The user perceives a multi-second blank screen on cold navigation and a noticeable lag when switching between pages via the sidebar.

After auditing the current code, the root causes are:

1. **Request waterfalls (sequential `await`s in server components).** The dashboard performs 5 sequential database queries; the course page performs ~11. Each query waits for the previous to finish even when they are independent.
2. **Sequential signed-URL generation.** The course page generates Supabase Storage signed URLs for Moodle files inside a `for…await` loop. On a course with 30 Moodle files, that is 30 round-trips to Supabase Storage performed in series — easily 1–3 seconds on its own.
3. **Eager Moodle Materials fetch.** All Moodle sections, files, the per-user `user_file_imports` filter, and the signed URLs are computed on every page load, even when the user never expands the section.
4. **No Suspense streaming or `loading.tsx`.** The server holds the response until every query finishes; the user sees a blank screen until the *slowest* query resolves.
5. **Sidebar refetches on every navigation.** `SidebarFolderTree` is a client component that re-runs `useEffect`-driven fetches keyed on `pathname`, re-issuing 2 Supabase queries on every route change. It also re-renders with a loading skeleton each time.
6. **No route prefetching from the sidebar.** Sidebar entries use `<button onClick={() => router.push(...)}>` instead of `<Link>`, so Next.js cannot prefetch the next route's RSC payload on hover or viewport visibility.
7. **Redundant auth round-trips.** `supabase.auth.getUser()` is called separately in `(dashboard)/layout.tsx` and again in each page, requiring two auth network calls per request.

## 2. Goals

- **First visit:** the page frame (sidebar, breadcrumb, course title, action buttons) renders in under ~100ms on a warm Vercel deployment. Heavy data sections render skeletons immediately and stream in as their queries resolve, in parallel.
- **Repeat navigation:** navigating between pages via the sidebar feels instant (<50ms perceived) because the destination route's RSC payload was already prefetched and the sidebar tree itself is served from a client cache.
- **Lazy Moodle Materials:** the Moodle Materials section is collapsed by default and does not fetch sections, files, or signed URLs until the user opens it.

## 3. Non-goals (out of scope)

- Database denormalization or single-RPC page loads (the "Approach 3" route from brainstorming).
- Migrating from SWR-style caching to React Query.
- Edge runtime or CDN caching of RSC payloads.
- Performance work on document/folder pages or the editor itself. Only `/dashboard` and `/dashboard/courses/[courseId]` are in scope. The same patterns may be applied to other pages later in a separate spec.

## 4. Approach overview

Three phases. Each phase ships as a separate PR off `dev` and is independently mergeable; if a later phase stalls, the earlier phases still deliver the bulk of the improvement.

| Phase | Theme | Outcome |
|------|-------|---------|
| 1 | Instant shell + parallel queries | First-visit feels instant; sections stream in. |
| 2 | Lazy-load Moodle materials | Heaviest non-essential data leaves the critical path. |
| 3 | Prefetch + stale-while-revalidate sidebar | Repeat navigation is instant. |

## 5. Phase 1 — Instant shell on first visit

### 5.1 Goal

Render the page frame in <100ms. Wrap heavy data sections in `<Suspense>` so each section streams in independently with its own skeleton. Parallelize independent queries with `Promise.all` and the "promise-as-prop" RSC pattern.

### 5.2 Techniques

**Parallel queries.** Convert sequential `await` chains into `Promise.all` for independent queries, so the total time becomes `max(query_times)` instead of `sum(query_times)`.

**RSC streaming with Suspense.** A server component does not need to `await` every query in the page body. Instead, the page kicks off promises and passes them as props into child server components that are wrapped in `<Suspense>`. Each child awaits its own promise; React streams HTML for the page shell immediately and replaces each `<Suspense>` fallback with real content as each promise resolves.

**Batched signed URLs.** Replace the `for…await` loop with a single `admin.storage.from('moodle-materials').createSignedUrls(paths, 3600)` plural call — one round-trip for all paths instead of N.

**Cached auth lookup.** Wrap `supabase.auth.getUser()` in `React.cache(...)` so the layout and the page share a single auth round-trip per request.

### 5.3 File changes

- **`src/app/(dashboard)/dashboard/page.tsx`** — collapse the 5 sequential awaits into a single `Promise.all`. The Moodle-connection lookup remains conditional on `user` but runs in parallel with the other queries (we resolve it inside the same `Promise.all` chained off the auth promise).
- **`src/app/(dashboard)/dashboard/courses/[courseId]/page.tsx`** — restructure:
  - Top-level `await` only the minimum needed to render the shell and decide `notFound()`: the cached current user and the course row. The course lookup determines `notFound()`; the user is needed for child components.
  - All other data (weeks, course documents, course-level personal files, week-level materials, week-level personal files, Moodle data, parent folder for breadcrumb) is **kicked off as promises** in the page and passed down as props to Suspense-wrapped child server components.
- **`src/app/(dashboard)/dashboard/loading.tsx`** — new file. Renders a skeleton: breadcrumb shimmer, folder/course/document card placeholders.
- **`src/app/(dashboard)/dashboard/courses/[courseId]/loading.tsx`** — new file. Renders a skeleton: breadcrumb shimmer, course title placeholder, action-button row, week and document placeholders.
- **Moodle data split.** The current code derives `importableMoodleFiles` (the lightweight metadata list used by the week import picker) from the same heavy fetch that also produces signed URLs. Phase 1 splits these into **two independent queries**:
  - `getMoodleImportableFiles(courseId, userId)` — returns metadata only (file id, name, storage_path, mime_type, file_size, section title) for the user's imported files. No signed URLs.
  - `getMoodleSectionsWithSignedUrls(courseId, userId)` — returns sections + files + per-user import filter + batched signed URLs. The heavy one.
  This split exists from Phase 1 so that Phase 2 can move only the heavy query into lazy-load mode without breaking the import picker.
- **New extracted server components** (one file each under `src/components/dashboard/`):
  - `<MoodleMaterialsSlot promise={...} />` — awaits the heavy `getMoodleSectionsWithSignedUrls` promise and renders the Moodle Materials section. Wrapped by the page in `<Suspense fallback={...}>`. (Phase 1 keeps this as an eager-but-streamed fetch; Phase 2 replaces it with a click-triggered lazy fetch.)
  - `<WeeksSlot promise={...} />` — awaits weeks + materials + week-level personal files + the lightweight `getMoodleImportableFiles` promise, and renders the list of weeks (each `<WeekSection>` receives the metadata list for its import picker).
  - `<CourseDocumentsSlot promise={...} />` — awaits course-level documents and personal files and renders them.
  - `<BreadcrumbParentFolderSlot promise={...} />` — awaits the parent folder row (only if `course.folder_id` is set) and renders the folder breadcrumb item.
- **`src/lib/auth/get-current-user.ts`** — new file:
  ```ts
  import { cache } from 'react';
  import { createClient } from '@/lib/supabase/server';
  export const getCurrentUser = cache(async () => {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    return user;
  });
  ```
  Used by both `(dashboard)/layout.tsx` and the page server components.
- **Signed-URL batching** — inside the Moodle data-loader function, replace the nested `for…await` loop with a single `createSignedUrls(paths, 3600)` call, then zip the returned signed URLs back onto the file objects by path.

### 5.4 Why this earns its complexity

- The `Promise.all` change shaves 50–70% off the server response time on Moodle-heavy courses.
- The `createSignedUrls` plural call collapses N round-trips into 1.
- Suspense streaming makes the page shell visible in well under 200ms even if some sections take longer. This is the canonical "perceived performance" pattern.

### 5.5 What does NOT change in Phase 1

- Moodle data is still fetched on every visit (just much faster and in a streamed Suspense boundary).
- Sidebar still refetches on every navigation.
- Sidebar buttons still don't prefetch.

These are addressed by Phases 2 and 3.

## 6. Phase 2 — Lazy-load Moodle materials

### 6.1 Goal

Remove the Moodle Materials data fetch from the initial page render entirely. The section header is rendered as a collapsed control; data loads only when the user expands it.

### 6.2 Behavior

- Default state: **collapsed**. Only the section header is rendered (label "Moodle Materials" + chevron).
- On expand: the client component invokes a Server Action that fetches the full Moodle data for the course (sections, per-user `user_file_imports` filter, batched signed URLs). While the action is in flight, the section shows an inline skeleton.
- Once loaded, results are cached in client component state. Collapsing and re-expanding does not refetch within the same page mount.
- On collapse: component stays mounted, data stays in state, only the visible rows are hidden.

### 6.3 File changes

- **`src/lib/actions/moodle-materials.ts`** — new file. Exports `getMoodleMaterialsForCourse(courseId: string)` Server Action. Encapsulates everything currently in lines 120–201 of the existing course page: the `user_course_syncs` lookup, `moodle_sections` join with files, per-user `user_file_imports` filter, and batched `createSignedUrls`. Returns a typed `MoodleSectionWithFiles[]`.
- **`src/components/dashboard/moodle-materials-section.tsx`** — new client component. Renders the collapsible header with chevron. On expand, calls the action via `useTransition` for a proper pending state. Shows inline skeleton during fetch and an error message on failure.
- **`src/app/(dashboard)/dashboard/courses/[courseId]/page.tsx`** — remove all Moodle fetching from the page entirely. Replace the `<MoodleMaterialsSlot>` introduced in Phase 1 with `<MoodleMaterialsSection courseId={courseId} userId={user.id} />`.
- **Import picker dependency.** The lightweight `getMoodleImportableFiles` query introduced in Phase 1 stays exactly as it is — fetched as a small parallel query at page load, consumed inside `<WeeksSlot>`. Only the heavy `getMoodleSectionsWithSignedUrls` work moves into the lazy `getMoodleMaterialsForCourse` Server Action. The two-query split established in Phase 1 is what makes this lazy-conversion clean.

### 6.4 Why

- Most navigation into a course is to take notes, not to browse Moodle. Deferring the heaviest data until the user asks for it removes the biggest variable cost from initial render entirely.
- Pattern: "defer expensive, optional work". Closely related to route-level code-splitting and resource hints.

## 7. Phase 3 — Instant repeat navigation

### 7.1 Goal

After the first visit, returning to a page renders immediately from cache while data revalidates in the background.

### 7.2 Techniques

**`<Link>` prefetching.** Next.js automatically prefetches `<Link>` destinations that are in the viewport, and accelerates on hover. The destination route's RSC payload arrives at the client before the user clicks. With the current `<button onClick={router.push}>` pattern, no prefetch happens.

**SWR for the sidebar tree.** SWR ("stale-while-revalidate") serves cached data instantly and revalidates in the background. The sidebar tree no longer flashes a skeleton on every navigation; it appears immediately from cache and silently updates if the data changed.

### 7.3 File changes

- **`src/components/dashboard/sidebar-folder-tree.tsx`** —
  - Replace `<button onClick={...}>` with `<Link href={...} prefetch>` in both `FolderNode` and `CourseNode`. The mobile-drawer close (`close()`) moves into a sibling `onClick` on the `<Link>` — the link still navigates because we do not call `preventDefault`. The expand/collapse chevron stays as a separate clickable element with `e.stopPropagation()`.
  - Replace the `useEffect`-on-`pathname` data fetching with a single `useSWR(['sidebar-tree', userId], () => getSidebarTree())` call (the fetcher invokes the Server Action directly — Next.js supports calling Server Actions from client components). Drop the `pathname` dependency entirely (SWR re-uses its in-memory cache across navigations).
  - Initial render uses SWR's `fallbackData` populated from a tiny server-rendered prop so the first paint and SWR agree (no hydration mismatch).
- **`src/lib/actions/sidebar.ts`** — new file. Exports `getSidebarTree()` Server Action that returns `{ folders: Folder[], courses: Course[] }` via a single `Promise.all` of the two queries. Used both by SWR and by the layout to populate `fallbackData`.
- **`src/app/(dashboard)/layout.tsx`** — call `getSidebarTree()` once and pass `{ folders, courses }` as a prop into `<SidebarFolderTree initialData={...} />`. The component feeds this into SWR's `fallbackData`.
- **`src/lib/swr/keys.ts`** — small file exporting canonical SWR keys (e.g., `sidebarTreeKey = (userId: string) => ['sidebar-tree', userId]`) so any server action consumer can `mutate(...)` the right key.
- **Mutation hookups.** In the existing client code that calls `createFolder`, `deleteFolder`, `createCourse`, `deleteCourse`, `moveDocument`, etc., add a `mutate(sidebarTreeKey(userId))` call after the action returns, so the sidebar reflects new structure immediately. (The existing `revalidatePath('/dashboard')` already handles server-rendered consumers; this handles the SWR client cache.)
- **`package.json`** — add `swr` dependency (~5kb gzip, maintained by Vercel).

### 7.4 Mobile drawer prefetch storm

Next.js only prefetches links that are in the viewport. The mobile drawer is closed by default, so prefetching only fires while the drawer is open and the link is visible. Acceptable. If a user with 30 courses in the drawer becomes a measurable problem, we can add `prefetch={false}` to courses below the fold in a follow-up.

## 8. Testing strategy

All tests follow the project standard (`pnpm test && pnpm test:integration && pnpm test:e2e`).

### 8.1 Unit / integration (Vitest)

- **`getMoodleMaterialsForCourse(courseId)`** — integration test against local Supabase. Verifies:
  - Returns only files where `user_file_imports.status='imported'` for the current user.
  - Sections with zero imported files are filtered out.
  - Signed URLs are populated for every returned file.
  - A second user does not see the first user's imports.
- **`getSidebarTree()`** — integration test. Returns the folders + courses for the current user, ordered by `position`.
- **`getCurrentUser` cache helper** — unit test. Within a single React render pass, the wrapped function returns the same Promise (one auth call), not two.
- **Signed-URL batching** — unit test mocking the Supabase Storage client. Asserts `createSignedUrls` is invoked exactly once with the full path array.

### 8.2 E2E (Playwright)

All E2E tests use the shared login helper from `e2e/helpers/auth.ts`. Test credentials per CLAUDE.md.

- **Dashboard load** — log in, navigate to `/dashboard`, verify folders + courses + documents render. No regression.
- **Course page first visit** — navigate to a seeded course, verify a skeleton appears at some point during load, then real content replaces it. (Do not assert timings — assert presence then replacement.)
- **Moodle lazy load** — navigate to a course that has Moodle materials. Verify the "Moodle Materials" header is visible but no file rows are in the DOM. Click to expand. Verify files appear and download links resolve.
- **Sidebar navigation** — navigate dashboard → course A → course B → back to dashboard. Verify the sidebar tree never shows a loading skeleton after the initial mount (SWR cache hit). Folders + courses remain visible across navigations.
- **Sidebar mutation freshness** — create a new folder via the dialog. Verify it appears in the sidebar within one tick without a full page refresh.

E2E tests must run unconditionally — no `test.skip` based on env vars (per CLAUDE.md).

### 8.3 Test registry

Update `e2e/TEST_REGISTRY.md` with entries for the lazy-Moodle and sidebar-prefetch scenarios.

### 8.4 Manual perf verification

Per phase, in the PR description: run `pnpm build && pnpm start`, hit the dashboard and a Moodle-heavy course, capture Chrome DevTools Network panel TTFB + LCP screenshots before/after, and paste them into the PR. Not automated (flaky), but documented.

## 9. Sequencing and PRs

Each phase ships as one feature branch off `dev`, one PR:

1. **`feat/perf-phase1-streaming`** — `Promise.all` + Suspense + `loading.tsx` + signed-URL batching + cached `getCurrentUser`.
2. **`feat/perf-phase2-lazy-moodle`** — extract Server Action, collapse Moodle into client component.
3. **`feat/perf-phase3-prefetch-swr`** — `<Link>` swap + SWR sidebar + `swr` dependency.

Each PR is independently shippable; if Phase 3 stalls, Phases 1+2 still deliver the majority of the improvement.

CI gates per the project's standard branch-protection rules: lint, format, unit, integration, build, E2E.

## 10. Risks

- **Accidental serialization in Phase 1.** If a streamed promise is `await`ed in the page body before being passed to its Suspense child, streaming silently degrades to sequential. Mitigation: the new `*Slot` server components are the only places these promises are awaited; the page body never awaits them.
- **SWR / server-rendered drift in Phase 3.** First paint comes from the server-rendered initial prop; SWR takes over on the client. If they disagree, React logs a hydration warning. Mitigation: pass the server-rendered `{ folders, courses }` as SWR's `fallbackData` so the first SWR read matches the server output exactly.
- **`<Link>` + mobile drawer close.** It is easy to break by accidentally calling `e.preventDefault()` in the onClick handler. Mitigation: the close handler must not preventDefault — only call `close()`. Link navigation is preserved.
- **30-course prefetch storm.** Most links won't be in viewport on desktop. On mobile, only links visible inside the open drawer prefetch. If observed in production we add `prefetch={false}` below a threshold.
- **SWR cache staleness after mutations.** If a server action mutates folders/courses but no client-side `mutate(sidebarTreeKey(userId))` is wired, the sidebar shows stale data until SWR's automatic revalidation (window focus, reconnect). Mitigation: every CRUD client handler that touches folders, courses, or course-folder placement calls `mutate(sidebarTreeKey(userId))` after the action returns.

## 11. What "done" looks like

- `pnpm build && pnpm start` shows the course page's TTFB and LCP improved by at least ~50% on a Moodle-heavy course relative to `main`.
- Repeat navigation from sidebar shows no sidebar-tree skeleton flash after the initial mount.
- Moodle Materials section is collapsed by default and only fetches on expand.
- `pnpm test && pnpm test:integration && pnpm test:e2e` all pass locally and in CI.
- E2E `TEST_REGISTRY.md` updated.
