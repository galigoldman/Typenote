# Feature Specification: E2E Tests — Auth & Documents

**Feature Branch**: `029-e2e-auth-documents`
**Created**: 2026-03-27
**Status**: Draft
**Input**: User description: "Write E2E browser tests for Auth and Documents features"

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Auth flows are tested in the browser (Priority: P1)

A developer pushes code that changes the login page. CI runs E2E tests that log in as a real user, sign up a new user, verify logout works, check that unauthenticated users get redirected, and confirm error messages appear for bad credentials. If any auth flow is broken, the PR is blocked.

**Why this priority**: Auth is the gateway to everything. If login breaks, no feature works. This is the highest-value test coverage.

**Independent Test**: Run `pnpm test:e2e -- e2e/auth.spec.ts` — all auth scenarios pass with zero skipped tests.

**Acceptance Scenarios**:

1. **Given** a seeded test user exists, **When** the test logs in with valid credentials, **Then** the browser redirects to the dashboard and the user's content is visible.
2. **Given** the login page, **When** the test enters a wrong password, **Then** an error message is visible on the page.
3. **Given** an unauthenticated browser, **When** the test navigates to `/dashboard`, **Then** the browser is redirected to `/login`.
4. **Given** a logged-in user, **When** the test clicks "Sign out", **Then** the browser redirects to the login page and the user can no longer access the dashboard.
5. **Given** the signup page, **When** the test fills in valid details, **Then** a new account is created and the browser redirects to the dashboard.
6. **Given** the signup page, **When** the test enters an invalid email, **Then** an error message is visible.
7. **Given** the forgot-password page, **When** the test submits an email, **Then** a confirmation message appears ("Check your email").

---

### User Story 2 - Document CRUD flows are tested in the browser (Priority: P1)

A developer pushes code that changes the dashboard or document management. CI runs E2E tests that create a new document, verify it appears on the dashboard, open it to confirm the editor loads, rename it, and delete it with the confirmation dialog. If any document flow breaks, the PR is blocked.

**Why this priority**: Documents are the core data the app manages. Creating, viewing, and deleting documents is the primary user action after logging in.

**Independent Test**: Run `pnpm test:e2e -- e2e/documents.spec.ts` — all document scenarios pass with zero skipped tests.

**Acceptance Scenarios**:

1. **Given** a logged-in user on the dashboard, **When** the test clicks "New Document" and fills the form, **Then** a new document is created and the browser navigates to the editor.
2. **Given** a dashboard with existing documents, **When** the test clicks a document card, **Then** the browser navigates to the document editor and the editor is visible.
3. **Given** a document card on the dashboard, **When** the test opens the options menu and clicks "Rename", **Then** the document title can be changed.
4. **Given** a document card on the dashboard, **When** the test opens the options menu and clicks "Delete", **Then** the document is removed from the dashboard.
5. **Given** a document inside a folder, **When** the test views the folder, **Then** the document appears in that folder's listing.
6. **Given** a document on the dashboard, **When** the test opens the options menu and clicks "Move", **Then** the move dialog appears and the document can be moved to a different folder.

---

### Edge Cases

- What happens when a test creates data (new user, new document) that persists across test runs? Tests must clean up after themselves or use unique identifiers to avoid collisions.
- What happens when CI runs tests serially and a previous test leaves the browser in an unexpected state? Each test must log in fresh and not depend on state from a previous test.
- What happens when a seeded document is deleted by a test and later tests need it? Tests that delete data should create their own data first, not delete seeded data.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: Auth E2E tests MUST cover: login with valid credentials, login with wrong password, signup with valid details, signup with invalid email, logout, unauthenticated redirect to login, and forgot-password submission.
- **FR-002**: Document E2E tests MUST cover: create document via dialog, open document from dashboard, rename document via options menu, delete document via options menu, document appears in correct folder, move document via move dialog.
- **FR-003**: All tests MUST use the shared login helper from `e2e/helpers/auth.ts` for authentication.
- **FR-004**: All tests MUST run unconditionally in CI — no `test.skip` based on environment variables.
- **FR-005**: Tests that create data MUST use unique identifiers (timestamps or random strings) to avoid collisions across retries and parallel runs.
- **FR-006**: Tests that delete data MUST create their own data first, never delete seeded data that other tests depend on.
- **FR-007**: The test registry (`e2e/TEST_REGISTRY.md`) MUST be updated to mark all implemented scenarios as complete.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Auth test file covers all 7 scenarios listed in the test registry with zero skipped.
- **SC-002**: Documents test file covers all 6 scenarios listed in the test registry with zero skipped.
- **SC-003**: All new tests pass locally with `pnpm test:e2e` and in CI on a PR to `dev`.
- **SC-004**: Test registry summary updates from 19/67 to 32/67 (13 new tests).
- **SC-005**: No existing tests are broken by the new tests.
