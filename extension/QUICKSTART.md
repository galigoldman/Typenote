# Typenote Moodle Extension — Quickstart

This guide walks you through building, loading, and verifying the extension end-to-end on your machine. The full automated suite covers gating logic and unit-level behavior; the steps below cover the real-Chrome-extension flow that can't be automated cheaply.

## Prerequisites

- pnpm, Node 22+
- Google Chrome (or another Chromium-family browser — Edge, Brave, Arc all work)
- A real Moodle account at a university you can log into

## Build & load (one-time)

1. **Build the extension bundle.**

   ```bash
   (cd extension && npm install && npm run build)
   ```

   First run installs the extension's own devDeps (esbuild, @types/chrome, typescript). Subsequent runs just rebuild. Produces `extension/dist/background/service-worker.js` and `extension/dist/content/moodle-scraper.js`.

2. **Open `chrome://extensions`** in Chrome.

3. **Enable "Developer mode"** (toggle, top right).

4. **Click "Load unpacked"** and select the `extension/` folder from this repo. The extension card should appear with name "Typenote Moodle Sync" and version `0.2.0`.

5. **Copy the extension ID** shown on the card (a 32-character lowercase string).

6. **Add it to `.env.local`:**

   ```
   NEXT_PUBLIC_EXTENSION_ID=<paste-the-id-here>
   ```

7. **Restart `pnpm dev`** (the env var is read at startup, not per-request).

## 10-step smoke checklist

After the one-time setup, run through this list. Each step lists the _expected_ outcome — flag any deviation.

1. `pnpm dev` → open `http://localhost:3000/dashboard` → log in.
   **Expect:** A "Moodle Integration" card on the dashboard with a URL input.

2. Open DevTools → Device Toolbar → select **iPad Pro 11** → reload.
   **Expect:** The Moodle card disappears entirely (touch gating).

3. Switch back to a desktop viewport → reload.
   **Expect:** The Moodle card reappears.

4. Enter your real Moodle URL (e.g. `moodle.runi.ac.il/2026`) → click **Connect**.
   **Expect:** Chrome shows a native permission popup asking access to `https://moodle.runi.ac.il/*`. Click **Allow**.

5. The card should now say "Connected to moodle.runi.ac.il" with a **Sync with Moodle** button.

6. Open `moodle.runi.ac.il` in another tab → log in to your Moodle account.

7. Return to the Typenote tab → click **Sync with Moodle**.
   **Expect:** A dialog opens, scrapes courses, and shows a course list with status badges ("New", "Synced", etc.).

8. Select **one course** → click **Preview Content**.
   **Expect:** Section/file list appears, with files already in the registry shown as "synced".

9. Select **one small file** in a section → click **Sync Selected**.
   **Expect:** Progress text "Downloading files... (1/1)" → "Successfully synced 1 course" with `1 file downloaded`.

10. Check Supabase Storage (Studio at `http://localhost:54323`) → bucket `moodle-materials` → the new file should be present.

If all 10 pass, the happy path is healthy.

## Pre-release manual checklist (real-credentials only)

These exercise the failure paths. Run them before bumping to a new release.

### A. Auth expiry mid-sync

1. Start a sync (open the dialog, get to the course-selection phase).
2. In your other Moodle tab, log out.
3. Continue the sync. **Expect:** the dialog surfaces "Your Moodle session may have expired" with a "Re-log into Moodle" link.

### B. Permission revocation mid-flow

1. Start a sync.
2. Open `chrome://extensions` → Typenote Moodle Sync → "Details" → toggle "Site access" off for your Moodle domain.
3. Retry the sync. **Expect:** the dialog shows the inline "Grant Permission" button. Click it → native popup → Allow → sync resumes.

### C. Large-course download with intentional flake

1. Sync a course with 20+ files.
2. Mid-download, kill your network briefly (e.g. macOS Network → toggle Wi-Fi off for 5 s, then on).
3. **Expect:** some files fail. After the run completes, the "done with errors" screen shows a **Retry failed (N)** button. Click it. **Expect:** failures retry; on success the screen flips to clean success.

---

## Troubleshooting

- **"Install Extension" card stays visible even after loading the unpacked extension.**
  `NEXT_PUBLIC_EXTENSION_ID` isn't matching the unpacked ID. Recopy from `chrome://extensions` and restart `pnpm dev`.

- **Permission popup never appears.**
  The manifest probably wasn't rebuilt after a change. Run `(cd extension && npm run build)` and reload the extension at `chrome://extensions`.

- **"Update Extension" card.**
  The loaded extension's manifest `version` doesn't match `EXPECTED_EXTENSION_VERSION` in `src/hooks/use-moodle-extension.ts`. Rebuild the extension or update the constant in lockstep.
