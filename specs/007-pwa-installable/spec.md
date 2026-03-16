# Feature Specification: PWA Installable App

**Feature Branch**: `007-pwa-installable`
**Created**: 2026-03-16
**Status**: Draft
**Input**: User description: "Add PWA support to make Typenote installable on iOS and Android devices with standalone mode, app icons, and splash screen"

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Install Typenote on Mobile Home Screen (Priority: P1)

A student using Typenote on their iPad or Android tablet visits the web app in their browser. The browser prompts them (or they manually choose) to "Add to Home Screen." After installing, Typenote appears as a standalone app with its own icon on their device home screen. Tapping the icon launches Typenote in full-screen mode without any browser chrome (no URL bar, no tabs), looking and feeling like a native app.

**Why this priority**: This is the core value of the PWA feature. Without installability, there is no PWA. Everything else depends on this working.

**Independent Test**: Can be fully tested by visiting Typenote in a mobile browser, installing it to the home screen, and verifying it launches in standalone mode with the correct icon and splash screen.

**Acceptance Scenarios**:

1. **Given** a user visits Typenote on Safari (iOS), **When** they tap "Add to Home Screen" from the share menu, **Then** the app is added to their home screen with the Typenote icon and name.
2. **Given** a user visits Typenote on Chrome (Android), **When** the browser install prompt appears and they accept, **Then** the app is installed with the Typenote icon and name.
3. **Given** a user taps the installed Typenote icon on their home screen, **When** the app launches, **Then** it opens in standalone mode (no browser chrome) starting at the dashboard.
4. **Given** the app is launching from the home screen, **When** the app is loading, **Then** a branded splash screen with the Typenote logo is displayed.

---

### User Story 2 - Consistent Branding Across Devices (Priority: P2)

The installed app displays a proper app icon on both iOS and Android home screens. On Android, the icon adapts to the device's icon shape (round, squircle, etc.) using a maskable icon. On iOS, the apple-touch-icon is used. The status bar and theme color match the Typenote brand.

**Why this priority**: Branding creates a professional, polished impression. Without proper icons and theming, the installed app looks broken or generic, undermining user trust.

**Independent Test**: Can be tested by installing Typenote on both iOS and Android devices and verifying the icon renders correctly in all icon shape contexts, and the status bar color matches the app theme.

**Acceptance Scenarios**:

1. **Given** Typenote is installed on an Android device, **When** the user views their home screen, **Then** the Typenote icon adapts to the device's icon shape (round, squircle, etc.) without clipping important content.
2. **Given** Typenote is installed on an iOS device, **When** the user views their home screen, **Then** the Typenote icon displays correctly as a rounded square.
3. **Given** Typenote is running in standalone mode, **When** the user looks at the status bar, **Then** the status bar color matches the Typenote theme (dark in dark mode, light in light mode).

---

### User Story 3 - App Metadata for Discovery (Priority: P3)

When the user is prompted to install Typenote or views it in their device's app settings, they see the correct app name ("Typenote"), a short description ("Smart notes for STEM students"), and relevant metadata. This helps users identify the app and understand its purpose.

**Why this priority**: Supporting detail that improves the install experience. Not critical to functionality but important for a polished product.

**Independent Test**: Can be tested by triggering the install prompt on Android Chrome and verifying the app name, description, and icon are displayed correctly in the install dialog.

**Acceptance Scenarios**:

1. **Given** Chrome shows the PWA install dialog on Android, **When** the user views the dialog, **Then** it displays "Typenote" as the name and "Smart notes for STEM students" as the description.
2. **Given** Typenote is installed on a device, **When** the user views the app in device settings / app info, **Then** the app name and icon are correctly displayed.

---

### Edge Cases

- What happens when the user is not logged in and opens the PWA from the home screen? The app redirects to the login page, and after login, navigates to the dashboard.
- What happens when the user installs the PWA but later clears browser data? On iOS (WebKit), the PWA may lose its cached state and require re-authentication. The app handles this gracefully by redirecting to login.
- What happens on browsers that don't support PWA installation (e.g., Firefox on iOS)? The app still works as a normal website; install functionality simply isn't available.
- What happens when the app is opened without internet? The app shows a meaningful error or loading state since offline mode is not in scope. It does not show a blank screen or crash.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST include a valid web app manifest (`manifest.json`) that passes browser PWA installability checks.
- **FR-002**: System MUST register a service worker to satisfy PWA installation requirements on all platforms.
- **FR-003**: System MUST provide app icons in at least 192x192 and 512x512 pixel sizes in PNG format.
- **FR-004**: System MUST provide a maskable icon variant for Android adaptive icon shapes.
- **FR-005**: System MUST provide an apple-touch-icon for iOS home screen installation.
- **FR-006**: System MUST launch in standalone display mode (no browser chrome) when opened from the home screen.
- **FR-007**: System MUST set `start_url` to the dashboard route so the app opens to the main view.
- **FR-008**: System MUST define theme color and background color for splash screen and status bar styling.
- **FR-009**: System MUST include appropriate meta tags in the HTML head for iOS PWA support (`apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`).
- **FR-010**: System MUST handle the unauthenticated state gracefully when launched from the home screen by redirecting to the login page.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Typenote passes the Chrome Lighthouse PWA installability audit with no errors.
- **SC-002**: Users can successfully install Typenote to their home screen on both iOS Safari and Android Chrome.
- **SC-003**: The installed app launches in standalone mode (no browser chrome visible) within 3 seconds on a standard mobile device.
- **SC-004**: App icon displays correctly without clipping or distortion on at least 3 different Android icon shapes (circle, squircle, rounded square).
- **SC-005**: App icon displays correctly on iOS home screen as a rounded square.
- **SC-006**: A branded splash screen is visible during app launch from the home screen.
