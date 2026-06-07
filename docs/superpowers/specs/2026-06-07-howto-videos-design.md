# How-To Videos — Full Feature Coverage — Design

**Date:** 2026-06-07 (expanded same day from 4 to 7 videos for full feature coverage)
**Status:** Approved
**Tooling:** [Daymo](../../../../Daymo) (`.demo` markdown → narrated MP4, Playwright-driven)

## Goal

Produce seven polished, narrated How-To videos covering Typenote's full feature
surface — document features (text, ink, images, math), course syncing (Moodle),
sharing, AI usage, file import, export, and versioning. Usable both as in-app/docs
help videos and on the landing page. English narration. Recorded against local dev
(`pnpm dev` + local Supabase) but with all on-screen content mocked/seeded to look
exactly like production — no test data, no dev artifacts, realistic university content.

A marketing "sizzle" video is deferred (cut from these scenes later).

## The seven videos

| # | File | Length | Flow |
|---|------|--------|------|
| 1 | `demos/howto/01-getting-started.demo` | ~70s | Dashboard tour → create course "Calculus 2" → open it, week structure → create first document → type a heading, autosave indicator |
| 2 | `demos/howto/02-taking-notes.demo` | ~85s | Open seeded document → write/format text → pen: handwrite + shape-snap a circle → paste image, drag/resize → zoom into detail |
| 3 | `demos/howto/03-writing-math.demo` | ~55s | Trigger inline math → type LaTeX → KaTeX renders → AI-assisted LaTeX from plain English (mocked response) → edit/copy a rendered equation |
| 4 | `demos/howto/04-moodle-import.demo` | ~85s | Course page → Moodle sync card → connect `moodle.tau.ac.il` course → extension reads course (stubbed) → file picker with realistic lecture PDFs → import → materials appear → open one in inline viewer |
| 5 | `demos/howto/05-ai-chat.demo` | ~75s | Open AI chat in a course → ask about course material → cited markdown+LaTeX answer (mocked) → quota display → conversation persists in list |
| 6 | `demos/howto/06-your-files.demo` | ~60s | Add your own files to a course (PDF/DOCX upload) → open in inline material viewer side-by-side with notes |
| 7 | `demos/howto/07-export-share-versions.demo` | ~75s | Export notes to PDF → share a document via link → open version history, restore an earlier version |
| 8 | `demos/howto/08-courses-folders.demo` | ~65s | Course cards & colors → course page anatomy → create a folder → move a course into it (uses "Calculus 2") |
| 9 | `demos/howto/09-share-course.demo` | ~80s | Dedicated sharing deep-dive: viewer vs contributor links, members list, then the recipient's perspective — session switches to second persona "Daniel Cohen" (`daniel.demo@typenote.dev`, created by `make-recipient-account.mjs`) who opens the share link and sees the course under "Shared Courses · by Maya Levi" |

Coverage check against the product surface: document features (1, 2, 3, 7),
course organization (1, 8), course syncing (4), sharing (7, 9), AI usage (3, 5),
file import (4, 6).

Note (added during production): video 4's Moodle fixture must scrape course
names that do NOT match Maya's existing courses — `moodle-sync.ts` always
creates a new Typenote course per synced Moodle course, so colliding names
produce duplicate course cards.

## Where things live

- `.demo` files, fixtures, and setup scripts live **in the Typenote repo** under
  `demos/howto/` — selectors and flows drift with the app UI, so demos version with
  the app, not with the Daymo tool.
  - `demos/howto/*.demo` — one file per video
  - `demos/howto/fixtures/` — mock JSON (Moodle course payloads, AI-LaTeX responses), sample images/PDFs
  - `demos/howto/make-auth-state.mjs` — bakes `auth.json` (Playwright storageState), same pattern as Daymo's `demo/make-storage-state.mjs`
  - `demos/howto/seed-demo-content.mjs` — one-time population of the demo account
- Daymo is invoked from the local checkout at `../Daymo` (verified at latest `main`, fc702a0).
- Output MP4s land next to each `.demo` file (`daymo stitch` convention). MP4s,
  `.daymo/` state dirs, and `auth.json` (contains live session cookies — never commit)
  are gitignored; `.demo` sources, fixtures, and scripts are committed.

## Production-like data & mocks

1. **Demo persona** — a dedicated demo account with a realistic name ("Maya Levi"),
   not `test@typenote.dev`. Auth baked once into `demos/howto/auth.json` via
   `make-auth-state.mjs`; every `.demo` references it through frontmatter
   `auth: { storageState: "./auth.json" }`.
2. **Seeded demo content** — `seed-demo-content.mjs` creates realistic university
   content for the persona: courses "Linear Algebra 1" and "Introduction to Computer
   Science", with weeks and documents containing genuine-looking notes (text,
   rendered math, a drawing). "Calculus 2" is NOT seeded — video 1 creates it live.
   The script supports `--reset` (delete the persona's content and re-seed) so video 1
   retakes don't accumulate duplicate "Calculus 2" courses. Nothing on screen may
   read as test data.
3. **AI calls mocked** — the AI-LaTeX endpoint (video 3) and the AI chat ask/quota/
   conversations endpoints (video 5) are mocked via Daymo frontmatter `mocks` routes
   or in-scene `page.route`: deterministic, instant, zero quota usage. Mocked chat
   answers must look real — markdown + LaTeX, course-grounded content.
4. **Moodle fully mocked** (video 4) — an init script stubs `chrome.runtime.sendMessage`
   so the app believes the extension is installed and returns a fixture Moodle course:
   realistic host (`moodle.tau.ac.il`), realistic files ("Lecture 3 — Eigenvalues.pdf",
   "Problem Set 2.pdf"). The `api/moodle/*` upload/import routes are mocked as needed
   so no real Moodle or real file transfer is required.
5. **Dev-ness leak check** — per video, verify no visible URLs, emails, or version
   strings expose the dev environment (browser chrome is outside the recorded
   viewport, so `localhost` in the address bar is not a concern).

## Video conventions

- Viewport 1440×900 (Daymo default; matches the Emilia tour precedent).
- TTS voice `en-US-JennyNeural`, rate `+0%`.
- `fx.step("…")` per logical user action; max one `fx.say` per step (Daymo rule).
- `fx.callout` / `fx.highlight` on each control being taught.
- No background music in How-Tos (calm docs tone); music is reserved for the future sizzle.
- Two-step pipeline (`daymo capture <file> --all` → `daymo stitch <file>`) — required
  for per-scene TTS narration mixing.

## Process & definition of done

1. Run `make-auth-state.mjs` and `seed-demo-content.mjs` once (local stack running).
2. Author each `.demo`; iterate: `capture --all` → review per-scene captures → fix
   selectors/timing → `stitch` → review final MP4.
3. A video is done when: every scene captures without failure, narration is synced,
   and no frame shows dev artifacts or unrealistic data.

## Risks

- **Video 4 extension stub** — fidelity depends on the exact message protocol in
  `extension/src/types/messages.ts` and the handshake in
  `src/components/dashboard/moodle-connection-setup.tsx`. First implementation task
  is reading both and building a faithful stub fixture. **Fallback:** load the real
  extension via `launchPersistentContext` (proven in `e2e/extension-real.spec.ts`),
  pending a check that Daymo can pass custom launch args.
- **Editor interactions under Daymo** — pen drawing and shape-snap rely on pointer
  events; if `fx.cursorTo` + `page.mouse` can't produce believable ink, fall back to
  pre-seeded drawings and demonstrate a shorter live stroke.
- **TTS cache determinism** — first capture is slow (Edge TTS synthesis); subsequent
  renders hit `<demo-dir>/.daymo/tts/` cache. Not a correctness risk, just pacing.
