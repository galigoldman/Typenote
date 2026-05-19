# Test Suite Audit — 2026-05-13

**Goal:** Reach release confidence. The notebook is the product; tests must be trustworthy before they gate releases.

**Branch audited:** `origin/main`

**Scope:** All Vitest unit, Vitest integration, and Playwright E2E tests. Plus a gap analysis of code that should be tested but isn't.

---

## Rubric

Every test was scored against:

1. **Behavior, not implementation** — asserts on user-visible outcome or DB state, not internal function calls.
2. **No false greens** — a real assertion that fails when the feature breaks.
3. **Real flow** — uses real Supabase / TipTap / KaTeX where possible; mocks only what's truly external. E2E uses the user-scoped client.
4. **Deterministic** — no arbitrary `waitForTimeout`, no test-order coupling.
5. **Useful failure message.**
6. **Tight scope** — no 700+ LOC god-files mixing concerns.
7. **Covers failure modes**, not just the happy path.

---

## Headline findings

### 1. CI is a smoke test, not a regression suite

**~45 of 75 E2E tests skip in CI** (60%) via `test.skip(!!process.env.CI, ...)`. CLAUDE.md explicitly forbids this pattern, yet every risky surface is gated by it:

| Surface            | E2E tests | Skipped in CI | Reason given                        |
| ------------------ | --------: | ------------: | ----------------------------------- |
| Canvas drawing     |        15 |            15 | "pointer events unreliable in CI"   |
| Drawing copy/paste |         8 |             8 | same                                |
| AI chat            |         6 |             6 | "course page flaky in CI"           |
| LaTeX math         |         5 |             3 | needs AI key                        |
| Courses page       |         5 |             4 | "course page rendering flaky"       |
| PDF export         |         5 |             4 | "needs puppeteer Chromium"          |
| File upload        |         3 |             3 | same + "file conversion unreliable" |
| Realtime sync      |         1 |             1 | "Supabase Realtime slow locally"    |

**Net effect:** when CI is green, the only things you've verified are auth, document CRUD, basic editor toolbar, and cursor-cascade pagination. Everything users actually do with the product is unverified.

### 2. RLS has never been tested

All 10 integration tests use the `service_role` client, which bypasses RLS by design. The two "RLS placeholder" tests (`conversations.integration.test.ts:524-549`, `crud.integration.test.ts:169-198`) call a non-existent `check_rls_enabled` RPC and fall back to checking table existence — they pass even if RLS is disabled. `personal-files.integration.test.ts:167-288` _looks_ like it tests RLS but queries via service_role; it only verifies the `user_id` column is set.

If a policy regresses, no test catches it. This is the highest-severity gap in the suite.

### 3. No PDF round-trip verification

11 PDF unit test files cover stroke rendering, font loading, pagination, HTML templates. **None parse the actual output bytes** with `pdf-lib` to verify what was actually written. Recent fix branches (`027-fix-latex-rtl`, `037-drawing-copy-paste`) have no regression test against rendered PDF. A broken renderer producing corrupt output would pass all current tests.

### 4. Rate-limit atomicity untested

`rate-limit.test.ts` (431 LOC) tests `checkAndIncrementUsage` as a pure function. The whole reason an atomic Postgres RPC exists is to handle concurrent increments — that's never simulated. Two users at quota cap making simultaneous requests could both succeed.

### 5. `/test/editor` mock pages violate CLAUDE.md

`e2e/editor-toolbar.spec.ts` (32 tests, the heaviest spec) and `e2e/export-pdf-editor.spec.ts` use `/test/editor` mock pages instead of real document flows. CLAUDE.md forbids this. These tests cannot catch real document loading, auth propagation, or persistence bugs.

### 6. Entire categories missing

Zero coverage for: visual regression, accessibility, security/abuse (XSS, prompt injection, file upload validation), performance budgets, mobile/touch flows.

---

## Per-file verdicts

Verdict legend: **KEEP** (good as-is), **FIX** (minor changes), **REWRITE** (rebuild the test from scratch), **DELETE** (false confidence, remove or replace).

### E2E (16 files, 75 tests)

| File                                       | Verdict | Tests | CI-skipped | Why                                                                                               |
| ------------------------------------------ | ------- | ----: | ---------: | ------------------------------------------------------------------------------------------------- |
| `e2e/auth.spec.ts`                         | KEEP    |     7 |          0 | Solid; real flows; clear assertions                                                               |
| `e2e/canvas-editor-cursor-cascade.spec.ts` | KEEP    |     9 |          0 | Excellent template — helpers, real data, precise assertions                                       |
| `e2e/canvas-type-mode-flow.spec.ts`        | KEEP    |     2 |          0 | Narrow, deterministic, strong assertions                                                          |
| `e2e/export-pdf-page-persistence.spec.ts`  | KEEP    |     1 |          0 | Targeted regression; good template                                                                |
| `e2e/documents.spec.ts`                    | FIX     |     7 |          0 | One `waitForTimeout(1000)`; fragile folder selector chain                                         |
| `e2e/export-pdf-dashboard.spec.ts`         | KEEP    |     2 |          1 | Skip is environment (Chromium), not design                                                        |
| `e2e/realtime-sync.spec.ts`                | KEEP    |     1 |          1 | Well-written; skip reason is local-CI-only Realtime latency                                       |
| `e2e/version-history.spec.ts`              | FIX     |     3 |          0 | Relies on seed data; silently passes if absent. Restore test never compares before/after content. |
| `e2e/file-upload.spec.ts`                  | FIX     |     3 |          3 | All 3 skip; weak assertions ("File imported" text exists, not file persisted)                     |
| `e2e/courses.spec.ts`                      | FIX     |     5 |          4 | Blocked by server-component auth flakiness; no negative tests                                     |
| `e2e/latex-math.spec.ts`                   | FIX     |     5 |          3 | Seeds via service_role; render/edit tests decoupled from the AI feature being tested              |
| `e2e/export-pdf-editor.spec.ts`            | FIX     |     4 |          3 | Uses `/test/editor` mock page (CLAUDE.md violation); fragile filename assertion                   |
| `e2e/editor-toolbar.spec.ts`               | REWRITE |    32 |          0 | Uses `/test/editor` — biggest spec in the suite, bypasses real Supabase auth/load                 |
| `e2e/canvas-editor.spec.ts`                | REWRITE |    15 |         15 | All skipped; assertions only check `canvas.toBeVisible()`, never that strokes were drawn          |
| `e2e/drawing-copy-paste.spec.ts`           | REWRITE |     8 |          8 | All skipped; never verifies pasted strokes match originals                                        |
| `e2e/ai-chat.spec.ts`                      | REWRITE |     6 |          6 | All skipped; asserts on styled containers (`div.bg-muted.rounded-2xl`), not chat content          |

**Best templates to copy:** `canvas-editor-cursor-cascade.spec.ts`, `export-pdf-page-persistence.spec.ts`, `auth.spec.ts`.

### Integration (10 files)

| File                                    | Verdict | Notes                                                                  |
| --------------------------------------- | ------- | ---------------------------------------------------------------------- |
| `ai-usage.integration.test.ts`          | KEEP    | Best in the suite — tier boundaries, quota reset, exact-at-limit cases |
| `moodle-registry.integration.test.ts`   | KEEP    | Cascade tests are thorough                                             |
| `moodle-user-syncs.integration.test.ts` | KEEP    | Solid                                                                  |
| `embeddings.integration.test.ts`        | KEEP    | Good unique constraint + vector matching coverage                      |
| `document-versions.integration.test.ts` | KEEP    | Cap enforcement, cascade, restore — solid                              |
| `documents.integration.test.ts`         | KEEP    | Add NULL folder_id + course_id edge case                               |
| `schema.integration.test.ts`            | KEEP    | Migration smoke test — adequate                                        |
| `conversations.integration.test.ts`     | FIX     | Remove false-green RLS placeholder (lines 488-550); add real RLS test  |
| `crud.integration.test.ts`              | FIX     | Same false-green RLS issue (lines 169-198)                             |
| `personal-files.integration.test.ts`    | FIX     | RLS test (lines 167-288) uses admin client, doesn't actually test RLS  |

**Universal gap:** every test runs as service_role. Add one RLS-enforcement file with two real user-scoped clients (see Phase 3).

### Unit tests — editor / math / canvas (~14 files)

| File                                | Verdict | Notes                                                                                               |
| ----------------------------------- | ------- | --------------------------------------------------------------------------------------------------- |
| `shape-detection.test.ts` (803 LOC) | KEEP    | Single responsibility; size justified. Add edge-of-canvas / overlapping / tiny / noisy shape tests. |
| `use-auto-save.test.ts` (736 LOC)   | KEEP    | Excellent. Add: unmount during in-flight save, concurrent edit during save, retry-then-new-trigger  |
| `math-extension.test.ts`            | KEEP    | Add display math (`$$`), math in lists/headings, RTL math, KaTeX failure                            |
| `math-node-view.test.tsx`           | FIX     | Mocks `NodeViewWrapper` and KaTeX entirely — bypasses real rendering                                |
| `coordinate-utils.test.ts`          | KEEP    | Solid for math; consider scroll-into-view scenarios                                                 |
| `zoom-physics.test.ts`              | KEEP    | Add stiction at zoom limits, overshoot damping                                                      |
| `overflow-utils.test.ts`            | KEEP    | Add mid-word split, inline mark split across page                                                   |
| `cursor-target.test.ts`             | KEEP    |                                                                                                     |
| `page-utils.test.ts`                | KEEP    | Add whitespace-only page case                                                                       |
| `direction.test.ts`                 | KEEP    | Add mixed LTR/RTL in single word                                                                    |
| `editor-toolbar.test.tsx`           | KEEP    | Add keyboard shortcuts, state persistence across selection                                          |
| `heading-dropdown.test.tsx`         | KEEP    |                                                                                                     |
| `canvas-tool-helpers.test.ts`       | KEEP    |                                                                                                     |
| `canvas-editor-undo-export.test.ts` | KEEP    | Excellent — add undo during in-flight auto-save                                                     |

### Unit tests — PDF export (11 files)

All 11 are KEEP individually, but the **suite as a whole is FIX** because:

- No test parses actual PDF bytes with pdf-lib.
- `html-template.test.ts` accidentally depends on real KaTeX rendering (no mock) — brittle.
- `tiptap-to-pdf.test.ts` mocks `splitTextToSize` to always return single line — multi-line wrap never tested.
- No 50+ page stress test, no math-at-page-boundary test, no RTL math test (despite 027-fix-latex-rtl), no real puppeteer round-trip.

### Unit tests — dashboard components (~14 files)

| File                                    | Verdict     | Notes                                                                            |
| --------------------------------------- | ----------- | -------------------------------------------------------------------------------- |
| `document-card.test.tsx`                | KEEP        | Fragile time-regex assertion; minor                                              |
| `course-card.test.tsx`                  | KEEP        | Add color badge, Space key                                                       |
| `folder-card.test.tsx`                  | KEEP        | Minimal but adequate                                                             |
| `material-upload.test.tsx`              | KEEP        | Add drag-drop, file type rejection                                               |
| `course-dialog.test.tsx`                | KEEP        | Add color-click behavior assertion                                               |
| `create-document-dialog.test.tsx`       | KEEP        | Never asserts `createDocument` actually fired                                    |
| `moodle-sync-prompt.test.tsx`           | KEEP        |                                                                                  |
| `moodle-connection-setup.test.tsx`      | KEEP        | UI-only; add submit + error flow                                                 |
| `moodle-sync-wrapper.test.tsx`          | KEEP        | Over-mocks children                                                              |
| `empty-state.test.tsx`                  | KEEP        |                                                                                  |
| `week-section.test.tsx`                 | KEEP        | Fragile menu selectors                                                           |
| `move-document-dialog.test.tsx`         | FIX         | Uses `fireEvent` 5 times — replace with `userEvent`                              |
| `moodle-sync-dialog.test.tsx`           | FIX         | No cancel/error/retry paths                                                      |
| `moodle-file-picker.test.tsx` (879 LOC) | FIX (split) | God file. Split into list / import / parent. `getByTestId` leakage at lines 765+ |

**Components with zero tests:** `folder-dialog`, `week-dialog`, `material-item`, `personal-file-item`, `personal-file-upload`, `sidebar-folder-tree`, `document-list-with-move`, `moodle-import-picker`, `sidebar-layout`, `moodle-sync-prompt-wrapper`.

### Unit tests — hooks / actions / queries / AI / moodle / analytics

| File                                                                                                                                          | Verdict         | Notes                                                                                |
| --------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------ |
| `analytics/events.test.ts`                                                                                                                    | KEEP            | Best in the suite — graceful degradation, SSR safety, no PII                         |
| `analytics/identify.test.tsx`                                                                                                                 | KEEP            |                                                                                      |
| `ai/extract-document-text.test.ts`                                                                                                            | KEEP            | Strong node-type coverage                                                            |
| `ai/embeddings.test.ts`                                                                                                                       | KEEP            |                                                                                      |
| `ai/prompts.test.ts`                                                                                                                          | KEEP            |                                                                                      |
| `moodle/dedup.test.ts`                                                                                                                        | KEEP            |                                                                                      |
| `use-pdf-background.test.ts`                                                                                                                  | KEEP            |                                                                                      |
| `use-moodle-extension.test.ts`                                                                                                                | KEEP            |                                                                                      |
| `use-version-snapshots.test.ts`                                                                                                               | KEEP            |                                                                                      |
| `pinch-damping.test.ts`, `use-pinch-zoom-stylus.test.ts`, `use-swipe-drawer.test.ts`, `use-media-query.test.ts`, `use-pdf-text-layer.test.ts` | KEEP            |                                                                                      |
| `actions/moodle-sync.test.ts`                                                                                                                 | KEEP            | Add concurrency + idempotency                                                        |
| `actions/ai-context.test.ts`                                                                                                                  | FIX             | No unauthenticated test; hardcoded PDF content; no rate-limit gate verification      |
| `ai/context-cache.test.ts`                                                                                                                    | FIX             | Mock always succeeds; no TTL/expiry test                                             |
| `use-realtime-sync.test.ts`                                                                                                                   | FIX             | Over-mocked channel; no unmount-during-async, no dep-change-mid-flight               |
| `ai/rate-limit.test.ts` (431 LOC)                                                                                                             | REWRITE         | No concurrency / atomicity test — the whole point of an atomic RPC                   |
| `moodle/sync-service.test.ts` (767 LOC)                                                                                                       | REWRITE (split) | Queue-mock makes RLS / table-name bugs invisible. Split into 4 scenario-based files. |

---

## Missing coverage — what's not tested at all

### Untested API route handlers (10 of 13)

`/api/ai/conversations/[id]` (GET/PATCH/DELETE), `/api/ai/conversations/[id]/messages` (POST), `/api/ai/reindex` (POST), `/api/ai/search` (POST), `/api/moodle/import` (POST), `/api/moodle/sync` (POST), `/api/moodle/upload` (POST), `/api/moodle/status` (GET). Each needs: unauthenticated rejection, malformed body, RLS enforcement, success path.

### Untested server actions

Courses, folders, course weeks, course materials — all CRUD modules have zero tests. Signing out also untested.

### Untested hooks

`use-drawing`, `use-eraser`, `use-export-pdf`, `use-file-upload`, `use-network-status`, `use-region-capture`, `use-selection`, `use-document-sync`.

### Untested utility libs

`canvas/stroke-utils.ts`, `canvas/scroll-lock.ts`, `canvas/text-split.ts`, `editor/font-size-extension.ts`, `editor/indent-extension.ts`, `editor/rtl-extension.ts`.

### Missing categories entirely

- **Visual regression** — zero. For a layout-heavy product (pagination, zoom, PDF preview) this is the single biggest blind spot for "did it still look right after my refactor?"
- **Accessibility** — zero axe-core, no keyboard navigation, no aria assertions.
- **Security / abuse** — zero. No XSS via document title/content, no prompt injection via AI chat, no upload-validation (.exe, oversized, double-extension), no SQL injection via search.
- **Performance budgets** — zero. Bundle size, LCP, TTI for a 50-page seeded doc are all unmeasured.
- **Mobile / touch E2E** — zero (despite features 023, 027, 034 being mobile-related).

---

## Phase 2 plan — execution order

Each item is a separate PR. Effort estimates assume a focused day of work. Order is by **risk × payoff**, not by ease.

### Tier A — fix the false greens (do these first)

These are critical because the suite is currently _lying_ about coverage.

1. **Replace RLS placeholders with real RLS tests** (1 day)  
   New file: `src/__tests__/integration/rls-isolation.integration.test.ts`. Two auth users via `supabase.auth.admin.createUser`, sign each in to get JWTs, build two anon clients with those JWTs, verify cross-user reads/writes return empty or fail on every user-owned table (`documents`, `folders`, `courses`, `course_materials`, `personal_files`, `ai_conversations`, `ai_messages`, `document_versions`). Delete the false-green placeholders.

2. **Migrate `e2e/editor-toolbar.spec.ts` off `/test/editor`** (0.5 day)  
   Seed a real document via API, navigate to `/dashboard/documents/{id}`, run the same 32 assertions against it. Same change for `e2e/export-pdf-editor.spec.ts`.

3. **Add PDF round-trip test** (0.5 day)  
   New file: `src/lib/pdf/__tests__/round-trip.integration.test.ts`. Build a seeded doc with text + math + stroke, export, parse output with `pdf-lib`, assert page count and embedded text.

4. **Add rate-limit concurrency test** (0.5 day)  
   In the integration file: `Promise.all` of N concurrent `checkAndIncrementUsage` calls at quota boundary; assert exactly `limit - current` succeed.

### Tier B — un-skip the E2E suite

Each un-skip is "fix root cause → strengthen assertions → un-skip → confirm CI green". Don't just delete the skip.

5. **Canvas pointer events in CI** (1 day, unlocks 23 tests across `canvas-editor`, `drawing-copy-paste`)  
   Switch from synthetic pointer dispatch to Playwright's CDP `Input.dispatchTouchEvent` / `Input.dispatchMouseEvent`. While you're there, rewrite assertions from `canvas.toBeVisible()` to "stroke count changed" / "page exported to PNG matches expected pixels in a region".

6. **Course page server-component auth flakiness** (1 day, unlocks 13 tests across `courses`, `ai-chat`, `file-upload`)  
   Root-cause it — almost certainly an auth cookie propagation race in server components. Currently every test on courses skips with the same boilerplate skip message; that's the symptom of one underlying bug.

7. **Install puppeteer Chromium in CI** (0.25 day, unlocks 7 PDF export tests)  
   Add `npx puppeteer browsers install chrome` to the CI workflow. The `@sparticuz/chromium-min` package is already a dep.

8. **AI key in CI** (0.25 day, unlocks 3 latex + 6 ai-chat tests)  
   Two options: (a) add a CI-only `GOOGLE_GENERATIVE_AI_API_KEY` secret with a tight quota; (b) intercept the AI request with `page.route()` and return fixture responses. (b) is cheaper and deterministic — recommended.

9. **Realtime sync latency** (0.5 day, unlocks 1 test)  
   Raise the timeout for that single test, or run against a faster local Realtime config.

### Tier C — fill the holes

10. **Finish `version-history.spec.ts`** (0.5 day) — create versions explicitly via API, assert before/after content differs after restore. Stop relying on seed data.
11. **API route handler tests** (2 days) — one test file per untested route. Cover: unauthenticated, malformed body, RLS, success. Highest priority: `/api/ai/ask`, `/api/ai/conversations`, `/api/moodle/upload`.
12. **Server action tests** (1 day) — courses, folders, weeks, materials CRUD.
13. **Untested hooks** (1 day) — `use-drawing`, `use-eraser`, `use-file-upload`, `use-network-status` are the high-value ones.
14. **Split `moodle-file-picker.test.tsx`** (0.5 day) — into list / import / parent files.
15. **Split & rewrite `sync-service.test.ts`** (1 day) — 4 scenario-based files; replace queue-mock with table-specific mocks that catch typos.
16. **Add edge cases to existing math/canvas/PDF tests** (1 day) — display math, math in lists, KaTeX failure, math at page boundary, RTL math, shapes at canvas edges, multi-line text wrap.

### Tier D — new categories

17. **Visual regression** (1 day) — Playwright `toHaveScreenshot` on editor canvas (empty, 1-page, 5-page, with math, with strokes), zoom levels, PDF preview.
18. **Security tests** (1 day) — XSS via doc title (`<script>alert(1)</script>`), prompt injection via AI chat, file upload validation (oversized, .exe, double-extension).
19. **Two-tab autosave contention E2E** (0.5 day) — open same doc in two contexts, type in both, verify final state is sane (last-write-wins or lock-based, whichever the spec says).
20. **Perf smoke** (0.5 day) — seed a 50-page doc, assert open → first-render < N ms in CI.
21. **A11y smoke** (0.5 day) — `@axe-core/playwright` on the 5 main pages.

### Total estimate

- Tier A: 2.5 days (critical; false-green fixes)
- Tier B: 3.25 days (un-skip CI)
- Tier C: 6 days (fill the holes)
- Tier D: 3.5 days (new categories)

**Total: ~15 working days for a complete pass.** Most of the _release confidence_ gain comes from Tiers A and B (5.75 days). Tier C and D harden against future regressions.

---

## Open questions before Phase 2

1. **Visual regression baseline:** OK to commit screenshot baselines to the repo, or store in a separate artifact?
2. **AI key in CI:** prefer real key with quota, or fixture-mocked responses? (Recommend fixtures.)
3. **Puppeteer Chromium in CI:** install in the existing workflow, or split PDF E2E into its own job with a heavier image?
4. **Two-user RLS test:** OK to create test users on every run, or seed two persistent test users in `supabase/seed.sql`?
5. **God-file splits:** want them in their own PRs, or bundled with the rewrite of the surface they cover?
