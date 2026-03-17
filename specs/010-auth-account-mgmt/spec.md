# Feature Specification: Auth & Account Management

**Feature Branch**: `010-auth-account-mgmt`
**Created**: 2026-03-17
**Status**: Draft
**Input**: User description: "GitHub Issue #44 — ensure signup and all auth-related flows are solid. Password reset flow. No email verification, no settings page, no avatar/profile changes."

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Password Reset via Email (Priority: P1)

A user who has forgotten their password needs a self-service way to regain access to their account. From the login page, they click "Forgot password?", enter their email address, and receive a password-reset email. The email contains a secure link that takes them to a reset page where they set a new password. After resetting, they are redirected to login and can sign in with the new password.

**Why this priority**: Without password reset, any user who forgets their password is permanently locked out. This is the single most critical missing auth flow — it directly impacts user retention and eliminates the need for manual support intervention.

**Independent Test**: Can be fully tested by creating a user, triggering "Forgot password?", following the emailed link, setting a new password, and confirming login works with the new credentials.

**Acceptance Scenarios**:

1. **Given** a registered user on the login page, **When** they click "Forgot password?" and submit their email, **Then** they see a confirmation message ("Check your email") and receive a password-reset email.
2. **Given** a user has received a reset email, **When** they click the reset link and submit a new valid password, **Then** the password is updated and they are redirected to the login page with a success message.
3. **Given** a user submits an unregistered email on the forgot-password page, **Then** the system still shows the same "Check your email" confirmation (to prevent email enumeration).
4. **Given** a user clicks an expired or already-used reset link, **When** they try to set a new password, **Then** they see an error explaining the link is invalid and are offered a way to request a new one.

---

### User Story 2 - Robust Signup Flow (Priority: P2)

A new user signs up with their display name, email, and password. The signup form provides clear validation feedback (password minimum length, required fields) and handles all error cases gracefully — duplicate email, network failure, invalid input. On success, the user is directed to the dashboard. The signup flow also supports Google OAuth as an alternative.

**Why this priority**: Signup already exists but needs hardening. Proper error handling and validation feedback are essential for a production-ready auth experience. Without clear error messages, users abandon signup or contact support unnecessarily.

**Independent Test**: Can be fully tested by attempting signup with valid data (success), duplicate email (error), weak password (validation), and Google OAuth (redirect flow).

**Acceptance Scenarios**:

1. **Given** a new user on the signup page, **When** they fill in valid display name, email, and password (6+ characters) and submit, **Then** an account is created and they are redirected to the dashboard.
2. **Given** a user tries to sign up with an email that's already registered, **When** they submit, **Then** they see a clear error message (without revealing whether the email exists — e.g., "Unable to create account. Try logging in or resetting your password.").
3. **Given** a user enters a password shorter than 6 characters, **When** they attempt to submit, **Then** client-side validation prevents submission and shows an inline error.
4. **Given** a user leaves required fields empty, **When** they attempt to submit, **Then** inline validation errors indicate which fields are required.
5. **Given** a user clicks "Sign up with Google", **When** the OAuth flow completes successfully, **Then** they are redirected to the dashboard with a new account created.

---

### User Story 3 - Robust Login Flow (Priority: P3)

An existing user logs in with email and password or via Google OAuth. The login form provides clear feedback on errors (wrong credentials, network issues) and smoothly redirects authenticated users to the dashboard. Users who are already logged in and visit `/login` are redirected to the dashboard.

**Why this priority**: Login already works but needs the same hardening as signup — consistent error messages, edge case handling, and a polished user experience.

**Independent Test**: Can be fully tested by logging in with correct credentials (success), wrong password (error), non-existent email (error), and Google OAuth (redirect flow).

**Acceptance Scenarios**:

1. **Given** a registered user on the login page, **When** they enter correct email and password and submit, **Then** they are authenticated and redirected to the dashboard.
2. **Given** a user enters incorrect credentials, **When** they submit, **Then** they see a generic error ("Invalid email or password") without revealing which field is wrong.
3. **Given** a user clicks "Sign in with Google", **When** the OAuth flow completes, **Then** they are authenticated and redirected to the dashboard.
4. **Given** an already-authenticated user visits `/login`, **Then** they are automatically redirected to the dashboard.
5. **Given** the authentication service is temporarily unavailable, **When** a user attempts to log in, **Then** they see a user-friendly error ("Something went wrong. Please try again.").

---

### Edge Cases

- What happens when a user requests multiple password-reset emails in quick succession? Rate limiting must prevent abuse (e.g., max 1 request per 60 seconds).
- What happens if the user clicks a reset link on a different device/browser than where they initiated the request? The reset flow should work regardless — the link is self-contained.
- What happens if the email delivery service is down? The UI should show an appropriate error rather than silently failing.
- What happens if a user tries to set their new password to the same as the current one? The system should accept it — enforcing "must differ" adds friction without meaningful security benefit.
- What happens if a Google OAuth user tries to use "Forgot password?" with their Google-associated email? The system should still send the reset email (Supabase allows setting a password alongside OAuth).
- What happens if a user's session expires while they are active? The next navigation should redirect to login with a clear message.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST provide a "Forgot password?" link on the login page that navigates to a password-reset request form.
- **FR-002**: System MUST send a password-reset email containing a secure, time-limited link when a user submits an email on the forgot-password page.
- **FR-003**: System MUST display the same confirmation message for both registered and unregistered emails on the forgot-password page (preventing email enumeration).
- **FR-004**: System MUST provide a password-reset page (reached via the emailed link) where the user can set a new password.
- **FR-005**: System MUST validate that the reset token is not expired or already used before allowing the password change.
- **FR-006**: System MUST validate new passwords meet minimum requirements (at least 6 characters) on both the signup and reset forms.
- **FR-007**: System MUST show clear, user-friendly error messages for all auth failure cases (wrong credentials, expired tokens, duplicate email, network errors).
- **FR-008**: System MUST NOT reveal whether an email address is registered in the system through any error message (on login, signup, or forgot-password pages).
- **FR-009**: System MUST redirect authenticated users away from login/signup pages to the dashboard.
- **FR-010**: System MUST redirect unauthenticated users away from dashboard routes to the login page.
- **FR-011**: System MUST support both email/password and Google OAuth for signup and login.
- **FR-012**: System MUST show inline validation errors on forms before submission (required fields, password length).

### Key Entities

- **User Account**: The authentication identity. Key attributes: email, hashed password, OAuth provider link, session state.
- **User Profile**: The user's public-facing record (display name, email). Auto-created on signup via database trigger.
- **Password Reset Token**: A time-limited, single-use token tied to a user's email. Authorizes a password change without the current password.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: A user who has forgotten their password can regain access to their account within 5 minutes using only their email, without any manual support.
- **SC-002**: All auth forms (login, signup, forgot password, reset password) provide user-friendly feedback — no raw error codes, no blank screens, no ambiguous messages on any failure path.
- **SC-003**: No auth form reveals whether a specific email address is registered in the system.
- **SC-004**: Users can complete signup in under 2 minutes with clear validation guiding them through required fields and password requirements.
- **SC-005**: The password-reset email link works regardless of which device or browser the user opens it on.

## Assumptions

- The project uses Supabase Auth with email/password signup and Google OAuth. Built-in Supabase features (password reset, OAuth) will be leveraged rather than building custom flows.
- Email templates are configurable via the Supabase dashboard. Default templates are acceptable for the initial implementation.
- The existing `profiles` table and auto-creation trigger (`handle_new_user`) are working correctly — no new database migrations needed.
- Email verification, settings page, avatar editing, and display name editing are explicitly out of scope.
- The minimum password length of 6 characters matches the current signup form validation.
- Rate limiting for password-reset requests relies on Supabase's built-in server-side rate limiting.
