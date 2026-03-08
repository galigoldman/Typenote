# Contract: PWA Web App Manifest

## Manifest Location

`/public/manifest.json` — served at `https://<domain>/manifest.json`

## Manifest Schema

```json
{
  "name": "Typenote",
  "short_name": "Typenote",
  "description": "A note-taking app for STEM students with drawing and real-time sync",
  "start_url": "/dashboard",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#18181b",
  "orientation": "any",
  "icons": [
    {
      "src": "/icons/icon-192x192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any maskable"
    },
    {
      "src": "/icons/icon-512x512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any maskable"
    }
  ]
}
```

## Required HTML Meta Tags

Added to root `layout.tsx` via Next.js Metadata API:

| Tag                                                   | Value                                                                                        | Purpose                        |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------ |
| `<link rel="manifest">`                               | `/manifest.json`                                                                             | PWA manifest link              |
| `<meta name="theme-color">`                           | `#18181b`                                                                                    | Browser chrome color           |
| `<meta name="apple-mobile-web-app-capable">`          | `yes`                                                                                        | iOS standalone mode            |
| `<meta name="apple-mobile-web-app-status-bar-style">` | `black-translucent`                                                                          | Status bar blends with app     |
| `<meta name="viewport">`                              | `width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover` | Prevent zoom, cover notch area |
| `<link rel="apple-touch-icon">`                       | `/icons/icon-192x192.png`                                                                    | iOS home screen icon           |

## Service Worker Scope

- **Scope**: `/` (entire app)
- **Registration**: Automatic via Serwist Next.js integration
- **Caching strategies**:
  - App shell (HTML/CSS/JS/fonts): Precache with Serwist
  - API calls (Supabase): Network-first with cache fallback
  - Document data: Custom IndexedDB caching (not service worker)

## Installation Flow

1. User visits Typenote on iPad Safari
2. Safari detects valid manifest + service worker
3. User taps Share → "Add to Home Screen"
4. App installs with icon and name
5. Subsequent launches open in standalone mode (no browser UI)
