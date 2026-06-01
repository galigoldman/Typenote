# Chrome Web Store Submission — Typenote Moodle Sync

This file contains everything you need to fill out the Chrome Web Store
listing form. Copy-paste each section into the matching field in the
[Developer Dashboard](https://chrome.google.com/webstore/devconsole).

## Build the upload bundle

```sh
cd extension
npm install         # only once, to pull adm-zip
npm run build:store
```

> Use **npm**, not pnpm, inside `extension/`. The repo root is a pnpm
> workspace, so `pnpm install` run from here installs the root project's
> deps and skips the extension's own `adm-zip`, making `build:store` fail
> with `ERR_MODULE_NOT_FOUND`. CI builds the extension with npm too
> (`.github/workflows/ci.yml`).

Output: `extension/store-build.zip` (~62 KB). The script strips dev-only
manifest artifacts and verifies nothing slipped through. **Never upload
`extension/manifest.json` directly** — it still contains the dev `"key"`
field and localhost permissions.

## Listing copy

### Short description (≤132 chars)

> Import your Moodle course materials into Typenote with one click. Notes,
> AI tutoring, and study tools — all linked to your courses.

### Detailed description

> Typenote Moodle Sync brings your course materials from Moodle directly
> into your Typenote workspace. Open any Moodle course you're enrolled in,
> click the extension icon, and every section, file, and document is
> mirrored into Typenote — organised by week, ready for note-taking and
> AI-powered study.
>
> **What it does**
>
> - Scrapes the structure of the Moodle course page you're viewing
> - Downloads attached materials (PDFs, slides, documents) and forwards
>   them to your Typenote account
> - Skips files that have already been imported, so re-syncing is fast
>
> **What it does NOT do**
>
> - It does not read or store your Moodle username/password — it relies
>   on the browser session you already have open
> - It does not run in the background — every sync is started by you
>   clicking the icon
> - It does not interact with any site other than Moodle and Typenote
>
> **Privacy**
>
> - Course content you import is stored in your private Typenote account
> - No analytics or tracking inside the extension itself
> - Full policy: https://typenote-two.vercel.app/privacy

### Category

Productivity → Workflow & Planning

### Language

English

## Privacy practices

### Single purpose

> The extension's single purpose is to import Moodle course materials
> (sections, files, and links) from a Moodle course page the user is
> already logged into, and forward them to that user's Typenote account.

### Permission justifications

Paste these one-by-one into the matching field on the dashboard's
"Privacy practices" tab.

| Permission  | Justification                                                                                                                                                                                                                                 |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `storage`   | Persists the user's selected Typenote session token and the last sync state per Moodle course, so the user does not have to re-authenticate on every sync.                                                                                    |
| `scripting` | Injects the Moodle scraper content script into the current Moodle tab when the user clicks "Sync." Without `scripting` we cannot read the course page structure.                                                                              |
| `cookies`   | Reads the Moodle session cookie for the active Moodle origin so we can fetch attached files through Moodle's authenticated endpoints (the same way the browser would). Cookies are never sent anywhere except back to the same Moodle origin. |
| `tabs`      | Detects whether the active tab is a Moodle course page (so the icon is enabled in the right context) and surfaces the course URL to the popup UI.                                                                                             |
| `activeTab` | Lets the extension act on the tab the user explicitly clicks the icon on, without requiring broad host access to every Moodle site in advance.                                                                                                |

### Host permission justifications

| Pattern                                  | Justification                                                                                                                                                                                                                                             |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `https://typenote-two.vercel.app/*`      | Production hostname for Typenote on Vercel — destination for all imported course data. (The `*.typenote.app` custom domain is stripped from the store bundle until it is live; `build-store.mjs` re-adds it at cutover.)                                   |
| `optional_host_permissions: https://*/*` | Requested at runtime only when the user clicks "Sync" on a Moodle page the extension hasn't seen before. We can't know every institution's Moodle hostname ahead of time, so we ask permission per origin instead of requiring blanket access on install. |

### Data usage disclosures

On the "Data usage" form, declare:

- **Personally identifiable information**: Yes — user's Typenote account
  ID is sent with each sync request so the import is attributed correctly.
- **Authentication information**: Yes — the Moodle session cookie of
  whichever Moodle instance the user is syncing from. Used **only** to
  fetch files from that same instance; never transmitted to Typenote or
  any other party.
- **Personal communications, financial info, health info, location,
  web history, user activity, website content**: No.

Then check:

- ☑ I do not sell or transfer user data to third parties outside of the
  approved use cases.
- ☑ I do not use or transfer user data for purposes unrelated to my
  item's single purpose.
- ☑ I do not use or transfer user data to determine creditworthiness or
  for lending purposes.

### Privacy policy URL

```
https://typenote-two.vercel.app/privacy
```

## Visual assets

Generated by `scripts/render-screenshots.mjs` into `extension/store-assets/`.
Run it from the **repo root** (it imports Playwright, which lives in the root
workspace, not in `extension/`):

```sh
node extension/scripts/render-screenshots.mjs
```

The script composites the REAL popup (actual `popup.css` + the exact markup
`popup.ts` renders) onto store-sized canvases, so the pixels match what ships.
Output dimensions are exact (Playwright at `deviceScaleFactor: 1`):

- [x] **Icon** — `extension/icons/icon-128.png` (128 × 128)
- [x] **Screenshot 1** — `store-assets/01-connected-sites.png` (1280 × 800) —
      popup's "Connected Moodle sites" view with two institutions linked
- [x] **Screenshot 2** — `store-assets/02-permission-grant.png` (1280 × 800) —
      the per-site permission prompt ("you're always in control")
- [x] **Small promo tile** — `store-assets/03-small-promo-tile.png` (440 × 280)
- [ ] _(Optional)_ Marquee promo tile — 1400 × 560 (not generated; add if you
      want the featured-placement slot)

> These shots show the extension's own UI, which is honest and self-contained.
> If you later want a "Typenote dashboard with imported materials" screenshot,
> that needs a logged-in app session with seeded data (local Supabase / Docker),
> which isn't part of this automated pass.

## Final pre-submit checklist

- [ ] `npm run build:store` ran cleanly (no sanity-check errors)
- [ ] `store-build/manifest.json` contains no `"key"`, no `http://` origins,
      no raw-IP origins
- [ ] Privacy policy is live at the URL above and reachable in an
      incognito window
- [ ] Listing screenshots prepared
- [ ] Account verified on Chrome Web Store Developer Dashboard ($5 one-time)
