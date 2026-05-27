# Feature Specification: Fix iPad Google OAuth Sign-In

**Feature Branch**: `048-fix-ipad-google-auth`
**Created**: 2026-05-27
**Status**: Draft
**Input**: User description: "the google sign up in ipad doesnt work, I press on google button and it just goes to a new user with no data, instead of letting me choose google account and get inside that user"

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Google Sign-In Shows Account Picker on iPad (Priority: P1)

A user opens Typenote on an iPad (Safari browser) and taps the "Sign up with Google" or "Sign in with Google" button. The Google account picker appears, allowing the user to select which Google account to use. After selecting an account, the user is redirected back to Typenote and lands on the dashboard with their existing data (if returning) or a fresh workspace (if new).

**Why this priority**: This is the core bug — without the Google account picker appearing, iPad users cannot authenticate with Google at all. Google OAuth is the only sign-up method on the signup page, making the entire signup flow broken on iPad.

**Independent Test**: Can be tested by opening the signup page on an iPad or iPad simulator in Safari, tapping the Google button, and verifying the Google OAuth consent/account-picker screen appears.

**Acceptance Scenarios**:

1. **Given** a user on iPad Safari on the signup page, **When** they tap "Sign up with Google", **Then** Safari navigates to Google's OAuth consent screen where they can select a Google account.
2. **Given** a user on iPad Safari on the login page, **When** they tap the "Google" button, **Then** Safari navigates to Google's OAuth consent screen where they can select a Google account.
3. **Given** a user who selected their Google account on the consent screen, **When** Google redirects back to Typenote, **Then** the user is authenticated and redirected to the dashboard with their data.
4. **Given** a returning user who previously signed in with Google, **When** they sign in with the same Google account on iPad, **Then** they see their existing documents and data (not a blank workspace).

---

### User Story 2 - OAuth Callback Completes Successfully on Safari (Priority: P1)

The OAuth callback route correctly exchanges the authorization code for a session on Safari/iPadOS. Safari's strict cookie policies (Intelligent Tracking Prevention) do not interfere with the PKCE code verifier or session cookies, ensuring the auth round-trip completes without silent failures.

**Why this priority**: Even if the Google picker appears, a broken callback means the user never gets authenticated. This is equally critical and may be the root cause of the "new user with no data" symptom.

**Independent Test**: Can be tested by initiating Google OAuth on iPad Safari, completing the Google consent flow, and verifying the `/auth/callback` route successfully exchanges the code for a session without errors.

**Acceptance Scenarios**:

1. **Given** a user on iPad Safari who completed the Google consent flow, **When** the callback route receives the authorization code, **Then** the code is exchanged for a valid session and the user is logged in.
2. **Given** Safari's privacy restrictions are active, **When** the OAuth redirect round-trip completes, **Then** all required cookies/state survive the redirect and the callback succeeds.
3. **Given** the code exchange fails for any reason, **When** the callback handles the error, **Then** the user sees a clear error message on the login page (not a blank workspace or a new empty account).

---

### User Story 3 - Consistent Google Auth Across All Devices (Priority: P2)

Google sign-in/sign-up works identically on desktop browsers, iPad (Safari and Chrome), iPhone (Safari and Chrome), and Android devices. The user experience does not vary by device or browser.

**Why this priority**: While the immediate bug is iPad-specific, the fix should ensure the auth flow is robust across all target platforms, not just patch one device.

**Independent Test**: Can be tested by running the Google sign-in flow on desktop Chrome, iPad Safari, iPhone Safari, and Android Chrome, verifying all reach the Google picker and return authenticated.

**Acceptance Scenarios**:

1. **Given** a user on any supported device/browser, **When** they tap/click the Google sign-in button, **Then** Google's OAuth consent screen appears.
2. **Given** a user who completed Google OAuth on any device, **When** they return to Typenote, **Then** they are authenticated and see the dashboard.

---

### Edge Cases

- What happens if the user cancels the Google consent screen and returns to Typenote? They should remain on the login/signup page without errors or unexpected state changes.
- What happens if the user's browser blocks all cookies? They should see a clear error message, not a silent failure or blank user state.
- What happens if the required cookies/state are lost during the redirect? The callback should show an authentication error and redirect to the login page, not silently create a new empty user.
- What happens if a user previously signed up with email/password and tries Google sign-in with the same email? The system should handle this gracefully (either link accounts or show a clear message), not create a duplicate user with no data.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST display the Google OAuth consent/account-picker screen when the user taps the Google sign-in or sign-up button on iPad Safari.
- **FR-002**: System MUST preserve all required authentication state (cookies, PKCE verifiers) across the full OAuth redirect round-trip on Safari/iPadOS, despite Intelligent Tracking Prevention restrictions.
- **FR-003**: System MUST correctly authenticate the user and redirect to the dashboard after a successful Google OAuth flow on iPad.
- **FR-004**: System MUST show a user-friendly error message if the OAuth flow fails (e.g., state lost, code exchange error), rather than silently creating a new empty user or showing a blank state.
- **FR-005**: System MUST NOT create a new empty/duplicate user when the OAuth callback fails — failed auth attempts must redirect to the login page with an error indicator.
- **FR-006**: System MUST work with Safari's default cookie and privacy policies without requiring the user to change browser settings.

### Key Entities

- **User Session**: The authenticated session created after successful OAuth, tied to the user's Google account identity.
- **OAuth State**: Cryptographic values stored client-side before the OAuth redirect and validated server-side during code exchange. Must survive the redirect round-trip across all browsers.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Users on iPad Safari can complete Google sign-in/sign-up successfully on the first attempt, including seeing the Google account picker and landing on the dashboard with their data.
- **SC-002**: The Google OAuth flow succeeds on iPad Safari without requiring the user to change any browser privacy or cookie settings.
- **SC-003**: Zero instances of silent new-user creation when the OAuth flow encounters an error — all failures show a visible error message.
- **SC-004**: Google sign-in works consistently across desktop Chrome, iPad Safari, iPhone Safari, and Android Chrome with no device-specific failures.
