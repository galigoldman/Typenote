# Feature Specification: Google Sign-Up as Only Registration Option

**Feature Branch**: `042-google-signup`
**Created**: 2026-05-18
**Status**: Draft
**Input**: User description: "I want to add google sign up and make it the only option instead of regular sign up. make a sign up with google and of course sign the users that sign this way as regular users that can get inside the app and have all their notebooks saved, as we have in the beta-users now. do not cancel any users, keep all of the existing users just make a google signup possible"

## User Scenarios & Testing _(mandatory)_

### User Story 1 - New User Signs Up with Google (Priority: P1)

A new user visits Typenote and wants to create an account. The signup page presents a single "Sign up with Google" button. The user clicks it, authenticates with their Google account, and is redirected into the app with a fully provisioned account — profile created, dashboard accessible, and ready to create notebooks.

**Why this priority**: This is the core feature — without it, no new users can register.

**Independent Test**: Can be fully tested by visiting the signup page, clicking "Sign up with Google", completing Google OAuth, and verifying the user lands on the dashboard with a profile containing their Google name and avatar.

**Acceptance Scenarios**:

1. **Given** a visitor with no account, **When** they visit `/signup` and click "Sign up with Google", **Then** they are redirected to Google's OAuth consent screen
2. **Given** a visitor completes Google OAuth, **When** the callback is processed, **Then** a new profile is created with their Google name, email, and avatar, and they are redirected to the dashboard
3. **Given** a visitor visits `/signup`, **When** the page loads, **Then** there is NO email/password form — only the Google sign-up button is visible

---

### User Story 2 - Existing Email/Password User Continues Logging In (Priority: P1)

An existing user who signed up with email/password during the beta can still log in using their email and password. Nothing changes for them — their data, notebooks, and account remain intact.

**Why this priority**: Equal to P1 — breaking existing user access would be critical.

**Independent Test**: Can be tested by logging in with a known email/password test account and verifying dashboard and notebooks load correctly.

**Acceptance Scenarios**:

1. **Given** an existing email/password user, **When** they visit `/login` and enter their credentials, **Then** they are authenticated and redirected to the dashboard with all their data intact
2. **Given** an existing user, **When** they log in, **Then** their notebooks, folders, courses, and AI conversations are all present

---

### User Story 3 - Existing User Logs In with Google (Priority: P2)

An existing user (whether they originally signed up with email/password or Google) can use the "Sign in with Google" button on the login page to authenticate.

**Why this priority**: Provides convenience for existing users who prefer Google login but is not essential for launch.

**Independent Test**: Can be tested by having an existing Google user click "Sign in with Google" on the login page and verifying they reach their dashboard.

**Acceptance Scenarios**:

1. **Given** an existing user who originally signed up with Google, **When** they click "Sign in with Google" on the login page, **Then** they are authenticated and see their existing data
2. **Given** an existing email/password user whose email matches their Google account, **When** they click "Sign in with Google", **Then** the system handles account linking per its configured identity linking behavior

---

### Edge Cases

- What happens if a user tries to access `/signup` while already authenticated? They should be redirected to the dashboard.
- What happens if Google OAuth fails or the user cancels? They should be returned to the signup page with a clear error message.
- What happens if a user navigates directly to the old email/password signup URL? They see the new Google-only signup page (same URL, updated content).
- What happens if Google is temporarily unavailable? The user sees an appropriate error message.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The signup page MUST present only a "Sign up with Google" button — no email, password, or display name fields
- **FR-002**: New users who sign up via Google MUST receive a full account with the same access level and capabilities as existing beta users
- **FR-003**: The system MUST automatically create a user profile using the Google account's name, email, and avatar upon first sign-up
- **FR-004**: All existing user accounts (email/password and Google) MUST remain fully functional — no data migration, no account deletion, no access changes
- **FR-005**: The login page MUST retain both email/password login AND Google sign-in options, so existing users can continue using their preferred method
- **FR-006**: After successful Google sign-up, the user MUST be redirected to the dashboard
- **FR-007**: If Google OAuth fails or is cancelled, the user MUST see a clear error message on the signup page
- **FR-008**: The signup page MUST link to the login page for users who already have an account

### Key Entities

- **Profile**: Represents a user in the system. Created automatically on sign-up via a database trigger. Key attributes: id, email, display_name, avatar_url. For Google users, display_name and avatar_url are populated from Google's OAuth metadata.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: New users can create an account via Google sign-up in under 30 seconds (from clicking button to reaching dashboard)
- **SC-002**: 100% of existing email/password users can still log in with their credentials after the change
- **SC-003**: New Google users have full access to all application features (create notebooks, AI chat, PDF export, etc.) immediately after sign-up
- **SC-004**: The signup page contains exactly one call-to-action for registration (the Google button) — no alternative registration paths

## Assumptions

- Google OAuth is already configured in Supabase (confirmed: the current signup and login pages already have working Google OAuth buttons)
- The existing `handle_new_user` database trigger already handles Google OAuth metadata (`name`, `avatar_url`) correctly — no database migration needed
- Supabase's default identity linking behavior is acceptable for cases where an email/password user later signs in with Google using the same email
- The login page retains email/password fields because existing beta users need them; the change is signup-only
- No new subscription tier or role assignment is needed — all users get the same default tier
