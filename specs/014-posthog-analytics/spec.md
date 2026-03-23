# Feature Specification: PostHog Analytics Integration

**Feature Branch**: `014-posthog-analytics`
**Created**: 2026-03-23
**Status**: Draft
**Input**: User description: "we just installed posthog plugin. we need to add it, and having sessions recordings, events, error tracking, in free"

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Session Recordings Capture User Behavior (Priority: P1)

As a product owner, I want every user session on Typenote to be recorded so I can replay how users navigate the app, identify friction points, and understand real usage patterns — without asking users for feedback directly.

**Why this priority**: Session recordings provide the richest behavioral insight. A single replay can surface UX issues that no amount of event data can explain. This is the highest-leverage analytics capability for a note-taking app where interaction patterns are complex (editor, canvas, file uploads, AI chat).

**Independent Test**: Can be tested by visiting Typenote, performing actions (opening a notebook, typing, drawing), and then viewing the full session replay in the PostHog dashboard.

**Acceptance Scenarios**:

1. **Given** a user opens Typenote in their browser, **When** they navigate pages, type in the editor, or interact with UI elements, **Then** the entire session is recorded and appears in PostHog's Session Recordings dashboard within 5 minutes.
2. **Given** a session recording exists, **When** the product owner opens it in PostHog, **Then** they can replay mouse movements, clicks, scrolls, and page transitions with accurate timing.
3. **Given** a user enters sensitive data (passwords, personal notes content), **When** the session is recorded, **Then** text inputs in the editor are masked by default to protect user privacy (PostHog's built-in input masking).

---

### User Story 2 - Custom Event Tracking for Key User Actions (Priority: P1)

As a product owner, I want key user actions automatically captured as events (page views, feature usage, navigation) so I can build funnels, measure feature adoption, and understand which parts of Typenote are used most.

**Why this priority**: Event tracking is the foundation of all analytics — funnels, retention, and feature adoption metrics depend on it. Combined with autocapture, this provides quantitative data that complements session recordings. Equal priority to recordings because they serve different analytical needs.

**Independent Test**: Can be tested by performing tracked actions in Typenote and verifying the corresponding events appear in PostHog's Events tab with correct properties.

**Acceptance Scenarios**:

1. **Given** PostHog is initialized on the client, **When** a user navigates to any page, **Then** a `$pageview` event is automatically captured with the page URL and referrer.
2. **Given** autocapture is enabled, **When** a user clicks a button, submits a form, or interacts with a UI element, **Then** the interaction is captured as an event with element metadata (tag, text, CSS selector).
3. **Given** the user performs a key domain action (e.g., creates a document, uploads a file, sends an AI chat message, exports a PDF), **Then** a custom named event is captured with relevant properties (e.g., event: `document_created`, properties: `{ course_id, document_type }`).

---

### User Story 3 - Error Tracking Surfaces Application Issues (Priority: P2)

As a developer, I want unhandled JavaScript errors and exceptions to be automatically captured and surfaced in PostHog so I can identify, triage, and fix bugs without relying solely on user-reported issues.

**Why this priority**: Error tracking is essential for application reliability but is slightly lower priority than behavioral analytics because the app already has basic error boundaries. PostHog's error tracking on the free tier provides a unified view alongside session replays (errors linked to the exact session where they occurred).

**Independent Test**: Can be tested by triggering a JavaScript error (e.g., visiting a page with a deliberate error) and verifying it appears in PostHog's Error Tracking section with a stack trace and linked session.

**Acceptance Scenarios**:

1. **Given** an unhandled JavaScript exception occurs during a user session, **When** PostHog's error tracking is enabled, **Then** the error is captured with a stack trace, browser info, and URL.
2. **Given** an error is captured, **When** a developer views it in PostHog, **Then** they can see the linked session recording showing exactly what the user did before the error occurred.
3. **Given** the same error occurs across multiple sessions, **When** the developer views the Error Tracking dashboard, **Then** errors are grouped by type/message and show occurrence counts and affected user counts.

---

### User Story 4 - Analytics Dashboard Accessible to Team (Priority: P3)

As a product owner, I want a PostHog project dashboard that shows high-level metrics (active users, popular pages, error rates, session counts) so I can monitor the health and usage of Typenote at a glance.

**Why this priority**: Dashboards are a consumption layer — they depend on events and recordings already flowing. This is the final step that makes the data actionable for non-technical team members.

**Independent Test**: Can be tested by opening the PostHog dashboard and verifying charts show real data from the application.

**Acceptance Scenarios**:

1. **Given** PostHog has been collecting data for at least one day, **When** the team opens the PostHog dashboard, **Then** they see widgets for active users, page views, top pages, and error counts.
2. **Given** the free tier is in use, **When** the team reviews the PostHog plan limits, **Then** all configured features (session recordings, events, error tracking) operate within free tier quotas.

---

### Edge Cases

- What happens when PostHog's ingestion endpoint is unreachable (network error, service outage)? Events should be silently dropped without impacting user experience — no errors shown to users, no performance degradation.
- What happens when a user has an ad blocker that blocks PostHog's tracking script? The application must function identically — analytics is non-blocking and optional. No UI errors or broken functionality.
- What happens when the free tier event/recording quota is exhausted? PostHog stops ingesting new data but the application continues working normally. The team receives a notification from PostHog.
- How does PostHog interact with the existing canvas editor and TipTap rich text editor? Session recordings should capture the visual state; autocapture should not interfere with editor key/pointer events.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST initialize the PostHog client SDK on every page load in the client-side application layer.
- **FR-002**: System MUST automatically capture page view events (`$pageview`) on route changes within the Next.js App Router (client-side navigation).
- **FR-003**: System MUST enable autocapture to record clicks, form submissions, and other standard DOM interactions without manual instrumentation.
- **FR-004**: System MUST enable session recording so that user sessions can be replayed in PostHog.
- **FR-005**: System MUST mask text input content in session recordings by default to protect user privacy (PostHog's built-in masking).
- **FR-006**: System MUST enable error tracking to capture unhandled JavaScript exceptions with stack traces.
- **FR-007**: System MUST capture custom named events for key domain actions: document creation, document deletion, file upload, AI chat message sent, PDF export, course creation, and document move.
- **FR-008**: System MUST include relevant contextual properties with custom events (e.g., course ID, document type, file size) without including personally identifiable information.
- **FR-009**: System MUST identify authenticated users to PostHog using their user ID (not email or name) so sessions and events can be linked across devices.
- **FR-010**: System MUST NOT block or degrade application functionality if PostHog fails to load or is blocked by an ad blocker.
- **FR-011**: System MUST operate entirely within PostHog's free tier limits (1 million events/month, 5,000 session recordings/month, error tracking included).
- **FR-012**: System MUST load the PostHog SDK asynchronously so it does not block initial page render or increase Time to Interactive.

### Key Entities

- **Event**: A tracked user action with a name, timestamp, properties, and associated user/session IDs. Events include both autocaptured interactions and custom named events.
- **Session Recording**: A visual replay of a user's browser session, linked to events and errors that occurred during that session. Contains mouse movements, clicks, scrolls, and DOM snapshots.
- **Error**: A captured JavaScript exception with stack trace, browser metadata, URL, and a link to the session recording where it occurred.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Session recordings appear in PostHog within 5 minutes of a user session ending, with full replay fidelity (mouse movements, clicks, page transitions visible).
- **SC-002**: All 7 custom domain events (document create, document delete, file upload, AI chat message, PDF export, course create, document move) are captured with correct properties when the corresponding actions are performed.
- **SC-003**: Unhandled JavaScript errors appear in PostHog's Error Tracking section with grouped stack traces and linked session recordings within 2 minutes of occurrence.
- **SC-004**: Application load time (Time to Interactive) increases by no more than 200ms after adding PostHog integration.
- **SC-005**: Application functions identically (all features usable, no console errors) when PostHog is blocked by an ad blocker or when its endpoint is unreachable.
- **SC-006**: All analytics features operate within PostHog free tier quotas for the expected user base (under 1M events/month, under 5K recordings/month).

## Assumptions

- PostHog Cloud (US or EU region) will be used rather than a self-hosted instance.
- The PostHog project has already been created in the PostHog dashboard and the project API key is available.
- Privacy masking defaults from PostHog are sufficient — no custom privacy rules are needed beyond default input masking.
- The free tier quotas are adequate for Typenote's current user base.
- User identification will use Supabase auth user IDs (UUIDs), which are not personally identifiable.
