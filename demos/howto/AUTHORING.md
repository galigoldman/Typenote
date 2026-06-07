# Authoring Typenote How-To videos with Daymo

Hard-won rules from videos 01–02. Follow these exactly.

## Layout & commands

- One folder per video: `demos/howto/NN-name/NN-name.demo`. Daymo keys its
  state (`.daymo/`) and `output.mp4` by directory.
- Capture + stitch (run from repo root `C:\projects\Typenote`):
  ```powershell
  node ..\Daymo\dist\cli.js capture demos\howto\NN-name\NN-name.demo --all
  node ..\Daymo\dist\cli.js stitch demos\howto\NN-name\NN-name.demo
  ```
- Dev server must be running on :3000 (it already is — do NOT restart it).
- Verify EVERY render by extracting frames and reading them as images:
  ```powershell
  ffmpeg -y -v error -i demos\howto\NN-name\output.mp4 -vf "fps=1/6,scale=960:-1" demos\howto\NN-name\.daymo\f_%02d.jpg
  ffmpeg -y -v error -sseof -2 -i demos\howto\NN-name\output.mp4 -frames:v 1 -vf scale=960:-1 demos\howto\NN-name\.daymo\f_last.jpg
  ```
  Read several frames + the last frame. Check: narration captions present, the
  feature actually visible, no error toasts, no empty/broken states.

## .demo structure

- **ONE scene per video** (one `# Heading` + one ```` ```playwright ````
  block). Scenes do NOT share state — each scene capture starts a fresh
  browser at the frontmatter `url`. Structure the scene with `fx.step("…")`.
- Frontmatter template:
  ```yaml
  ---
  title: <video title>
  description: <one line>
  url: http://localhost:3000/dashboard
  viewport: { width: 1440, height: 900 }
  auth: { storageState: "../auth.json" }
  tts:
    voice: en-US-JennyNeural
    rate: "+0%"
  ---
  ```
- Demo persona: Maya Levi (`maya.demo@typenote.dev`). Seeded courses:
  "Linear Algebra 1" (docs: "Lecture 4 — Eigenvalues & Eigenvectors",
  "Problem Set 3", "Midterm Summary" — the latter has version history),
  "Introduction to Computer Science" (docs: "Lecture 7 — Recursion",
  "Big-O Cheat Sheet").

## fx API (the README is stale — these are the real signatures)

- `fx.say(textLiteral)` — string literal only. Max ONE `fx.say` per `fx.step`.
- `fx.cursorTo(selector, description)` / `fx.highlight(selector, description, { duration })`
  / `fx.click(selector, description)` — description string REQUIRED.
- `fx.cursorTo` and `fx.highlight` resolve selectors with
  `document.querySelector` — **plain CSS only**, no `:has-text()`. For
  text-matched targets, tag them first:
  ```js
  const tag = (label, match, scope) => page.evaluate(([label, match, scope]) => {
    const el = [...document.querySelectorAll(scope || "button")]
      .find((e) => (e.textContent || "").trim().includes(match));
    if (el) el.setAttribute("data-demo", label);
  }, [label, match, scope]);
  await tag("new-course", "New Course");
  await fx.cursorTo('[data-demo="new-course"]', "New Course button");
  ```
- `fx.click` and `page.*` use the full Playwright engine (`:has-text()` fine).
- `fx.typeWithDelay(selector, text, cps)`, `fx.pause(seconds)`.
- Parallel narration: `const n = fx.say("…"); …actions…; await n;`
- The playwright block is a Node `AsyncFunction(page, fx, console)` — Node
  globals work, and dynamic `await import("node:fs/promises")` works.
  `process.cwd()` is the repo root.

## App-specific gotchas

- **Always at scene start** (after first waitForSelector):
  ```js
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  ```
  (hides the Next.js dev-tools badge — a dev artifact that must never be in frame).
- Documents open in the **canvas editor** only when `documents.pages` is not
  null (default `{"pages":[]}`). `node demos/howto/reset-docs.mjs "<title>"`
  resets a doc's content correctly between retakes.
- Editor mode buttons ("Draw", "Type") act on pointerdown — `fx.click` /
  `page.click` work; `el.click()` from evaluate does NOT.
- Typing into the page: `await page.click('button:has-text("Type")').catch(()=>{});
  await page.click('.ProseMirror'); await page.keyboard.type("…", { delay: 28 });`
- Wait for autosave: `await page.waitForSelector('text="Saved"', { timeout: 20000 })`.
- **Drawing needs pen pointers** (`use-drawing.ts` gates `pointerType === 'pen'`),
  and synthetic pens crash `setPointerCapture` — neutralize it once per scene:
  ```js
  await page.evaluate(() => {
    Element.prototype.setPointerCapture = () => {};
    Element.prototype.releasePointerCapture = () => {};
  });
  ```
  Then dispatch strokes (see 02-taking-notes.demo `drawStroke` helper).
- Zoom math: `zoom *= (1 - deltaY/100)` per ctrl+wheel tick on
  `[data-canvas-scroll]`, clamped 0.25–5. Use small deltas (±40), and land
  back near 100% (3 ticks of −40 in ≈ 2.74x, 2 ticks of +40 out ≈ ×0.36).
- LaTeX onboarding popover is pre-dismissed via auth.json. Don't re-bake
  auth.json (`make-auth-state.mjs`) unless login breaks.
- The narration text must never mention selectors/mechanics — it speaks to a
  student watching the video.

## Server-side state hygiene

Captures write REAL rows (hosted Supabase). Before every retake, undo what
the previous take created (each video's folder may include its own cleanup
.mjs script — follow the patterns of `cleanup-video01.mjs` / `reset-docs.mjs`,
which sign in as Maya via `demo-env.mjs` and delete/reset only her rows).
