# Feature Specification: PWA Installable App

**Feature Branch**: `007-pwa-installable`
**Created**: 2026-03-16
**Status**: Draft
**Input**: User description: "Add PWA support to make Typenote installable on iOS and Android devices with standalone mode, app icons, and splash screen"

## Scope Boundaries

### In Scope

- Web app manifest for installability
- App icons (standard + maskable + apple-touch-icon)
- Standalone display mode (no browser chrome)
- Branded splash screen on launch
- iOS and Android mobile/tablet support
- Theme color and status bar styling
- iOS-specific PWA meta tags

### Out of Scope

- Offline caching / offline-first functionality
- Push notifications
- Background sync
- Custom install prompt UI (intercepting browser install events)
- App update notification when a new version is deployed
- Desktop PWA installability

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Install Typenote on Mobile Home Screen (Priority: P1)

A student using Typenote on their iPad or Android tablet visits the web app in their browser. The browser prompts them (or they manually choose) to "Add to Home Screen." After installing, Typenote appears as a standalone app with its own icon on their device home screen. Tapping the icon launches Typenote in full-screen mode without any browser chrome (no URL bar, no tabs), looking and feeling like a native app.

**Why this priority**: This is the core value of the PWA feature. Without installability, there is no PWA. Everything else depends on this working.

**Independent Test**: Can be fully tested by visiting Typenote in a mobile browser, installing it to the home screen, and verifying it launches in standalone mode with the correct icon and splash screen.

**Acceptance Scenarios**:

1. **Given** a user visits Typenote on Safari (iOS), **When** they tap "Add to Home Screen" from the share menu, **Then** the app is added to their home screen with the Typenote icon and name.
2. **Given** a user visits Typenote on Chrome (Android), **When** the user selects "Install app" from the browser menu (or accepts the browser install prompt if shown), **Then** the app is installed with the Typenote icon and name.
3. **Given** a user taps the installed Typenote icon on their home screen, **When** the app launches, **Then** it opens in standalone mode (no browser chrome) starting at the dashboard.
4. **Given** the app is launching from the home screen, **When** the app is loading, **Then** a branded splash screen with the Typenote logo is displayed.
5. **Given** a user who is not logged in taps the installed Typenote icon, **When** the app launches, **Then** it redirects to the login page and after successful login navigates to the dashboard.

---

### User Story 2 - Consistent Branding Across Devices (Priority: P2)

The installed app displays a proper app icon on both iOS and Android home screens. On Android, the icon adapts to the device's icon shape (round, squircle, etc.) using a maskable icon. On iOS, the apple-touch-icon is used. The status bar and theme color match the Typenote brand.

**Why this priority**: Branding creates a professional, polished impression. Without proper icons and theming, the installed app looks broken or generic, undermining user trust.

**Independent Test**: Can be tested by installing Typenote on both iOS and Android devices and verifying the icon renders correctly in all icon shape contexts, and the status bar color matches the app theme.

**Acceptance Scenarios**:

1. **Given** Typenote is installed on an Android device, **When** the user views their home screen, **Then** the Typenote icon adapts to the device's icon shape (round, squircle, etc.) without clipping important content.
2. **Given** Typenote is installed on an iOS device, **When** the user views their home screen, **Then** the Typenote icon displays correctly as a rounded square.
3. **Given** Typenote is running in standalone mode, **When** the user looks at the status bar, **Then** the status bar color matches the Typenote theme.

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
- What happens when the app is opened without internet? The app displays a branded error page rather than a browser-default offline page or blank screen.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST include a valid web app manifest that passes browser PWA installability checks.
- **FR-002**: System MUST satisfy all browser-required prerequisites for PWA installability on target platforms (iOS Safari, Android Chrome).
- **FR-003**: System MUST provide app icons at all sizes required by target platform install dialogs (minimum 192x192 and 512x512).
- **FR-004**: System MUST provide a maskable icon variant for Android adaptive icon shapes.
- **FR-005**: System MUST provide an apple-touch-icon for iOS home screen installation.
- **FR-006**: System MUST launch in standalone display mode (no browser chrome) when opened from the home screen.
- **FR-007**: System MUST open to the main dashboard view when launched from the home screen.
- **FR-008**: System MUST define theme color and background color for splash screen and status bar styling.
- **FR-009**: System MUST include appropriate meta tags for iOS PWA support (standalone capable, status bar style).
- **FR-010**: System MUST handle the unauthenticated state gracefully when launched from the home screen by redirecting to the login page.
- **FR-011**: When the installed app is opened without network connectivity, the system MUST display a branded error state rather than a browser-default offline page or blank screen.

### Compatibility

- **Target platforms**: iOS Safari (iOS 16.4+), Android Chrome (latest 2 major versions)
- **Other browsers**: The app continues to function as a normal website; install functionality may not be available.

## Assumptions

- The app is served over HTTPS (a prerequisite for PWA installability).
- The user will provide source logo assets at sufficient resolution for generating all required icon sizes.
- The existing authentication flow (Supabase) works correctly in standalone/PWA mode.
- No changes to existing routes or page structure are needed.
- FR-011 requires only a minimal offline fallback page, not full offline application functionality.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Typenote passes the Chrome Lighthouse PWA installability audit with no errors.
- **SC-002**: Users can successfully install Typenote to their home screen on both iOS Safari and Android Chrome.
- **SC-003**: The installed app launches in standalone mode (no browser chrome visible).
- **SC-004**: App icon displays correctly without clipping or distortion on at least 3 different Android icon shapes (circle, squircle, rounded square).
- **SC-005**: App icon displays correctly on iOS home screen as a rounded square.
- **SC-006**: A branded splash screen is visible during app launch from the home screen.
- **SC-007**: When opened without network, the app displays a branded error page rather than a browser default.
