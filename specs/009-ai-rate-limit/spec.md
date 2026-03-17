# Feature Specification: AI Rate Limiting

**Feature Branch**: `009-ai-rate-limit`
**Created**: 2026-03-17
**Status**: Draft
**Input**: GitHub Issue #48 — "feat: AI rate limiting — per-user daily query cap". No rate limiting on AI endpoints. A single user can run up unlimited API costs. Support multiple subscription levels with configurable limits, preparing for real subscription tiers.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Free Tier Daily Limit Enforcement (Priority: P1)

A student on the free tier opens the AI chat panel and asks questions throughout the day. After reaching their daily limit (e.g., 30 questions), the next time they try to ask a question, instead of calling the AI model, the system shows a friendly message: "You've used all your AI questions for today. Your quota resets at midnight." The input is disabled or the send button is replaced with a message indicating the limit.

**Why this priority**: This is the core protection mechanism. Without it, a single user can generate unlimited API costs. This is the minimum viable rate limiting that must ship.

**Independent Test**: Log in as a free-tier user. Send questions until the daily limit is reached. Verify the next question is blocked with a friendly message. Verify the counter resets after midnight (UTC).

**Acceptance Scenarios**:

1. **Given** a free-tier user has sent fewer questions than their daily limit, **When** they send a question, **Then** the question is processed normally by the AI.
2. **Given** a free-tier user has reached their daily limit, **When** they attempt to send another question, **Then** the request is rejected with a friendly, non-technical message explaining the limit and when it resets.
3. **Given** a free-tier user reached their limit yesterday, **When** a new day begins (midnight UTC), **Then** their quota resets and they can ask questions again.
4. **Given** a free-tier user is blocked, **When** they view the error message, **Then** it clearly states how many questions they had, that they've used them all, and when the reset occurs — no cryptic error codes or technical jargon.

---

### User Story 2 - Quota Visibility in Chat Panel (Priority: P1)

Before and while using the AI chat, the student can see how many questions they have remaining for the day. This is displayed as a small, non-intrusive indicator in the AI chat panel (e.g., "12/30 questions remaining today"). As they use questions, the counter updates in real time.

**Why this priority**: Users need transparency about their usage. Without visibility, hitting the limit feels sudden and frustrating. Showing remaining quota sets expectations and helps students pace their usage.

**Independent Test**: Open the AI chat panel. Verify the remaining quota is displayed. Send a question. Verify the counter decrements. Close and reopen the panel. Verify the counter still shows the correct value.

**Acceptance Scenarios**:

1. **Given** a user opens the AI chat panel, **When** the panel loads, **Then** a quota indicator shows the remaining questions for the day (e.g., "28 of 30 questions remaining").
2. **Given** a user sends a question, **When** the response completes, **Then** the quota indicator decrements by one without requiring a page refresh.
3. **Given** a user has used most of their quota (e.g., 5 or fewer remaining), **When** they view the indicator, **Then** it visually signals low quota (e.g., changes color to amber/red) to warn the user.
4. **Given** a user has exhausted their quota, **When** they view the chat panel, **Then** the indicator shows "0 remaining" and the input area communicates that they cannot send more questions until reset.

---

### User Story 3 - Multiple Subscription Levels (Priority: P1)

The system supports different daily limits based on the user's subscription level. For launch, two tiers exist: "free" (default, e.g., 30 questions/day) and a placeholder "pro" tier (e.g., 100 questions/day). The tier limits are configurable so that when real subscription billing is added later, changing a user's tier automatically changes their daily AI quota without code changes.

**Why this priority**: The user explicitly requested multi-level support to prepare for real subscriptions. Building the tier lookup now avoids a painful refactor later. The actual billing integration is out of scope, but the data model and limit resolution must be tier-aware from day one.

**Independent Test**: Set a user's subscription tier to "pro" in the database. Verify they get 100 questions/day instead of 30. Change their tier back to "free". Verify the limit drops back to 30.

**Acceptance Scenarios**:

1. **Given** a user with the "free" tier, **When** they use the AI, **Then** their daily limit matches the configured free-tier cap (default: 30).
2. **Given** a user with the "pro" tier, **When** they use the AI, **Then** their daily limit matches the configured pro-tier cap (default: 100).
3. **Given** an administrator changes a user's tier from "free" to "pro" mid-day, **When** the user's next request is processed, **Then** the new higher limit applies immediately (their existing usage count is preserved, but they now have a higher ceiling).
4. **Given** a new subscription tier is added (e.g., "team" with 500/day), **When** the configuration is updated, **Then** users assigned to the new tier receive the correct limit without any code deployment.
5. **Given** a user has no explicit tier set, **When** the system resolves their limit, **Then** they default to the "free" tier.

---

### User Story 4 - Admin Usage Visibility (Priority: P2)

An administrator (or the developer reviewing the database) can see AI usage data: which users asked how many questions on which days, and which AI model was used. This data lives in a queryable database table. No admin dashboard UI is required for this phase — direct database queries are sufficient.

**Why this priority**: Cost monitoring and abuse detection require visibility into usage patterns. Even without a UI, having structured data in the database enables ad-hoc analysis and future dashboard development.

**Independent Test**: Query the usage tracking table directly. Verify it contains rows with user ID, date, question count, and model used.

**Acceptance Scenarios**:

1. **Given** a user asks an AI question, **When** the request is processed, **Then** a usage record is created or updated in the database with the user ID, current date, incremented count, and model identifier.
2. **Given** multiple users use AI on the same day, **When** the usage table is queried, **Then** each user has their own row(s) for that day.
3. **Given** a user uses both "quick" (Flash) and "deep" (Pro) modes, **When** the usage table is queried, **Then** the model information is recorded per query (either as separate rows per model or as a field on the aggregated row).

---

### Edge Cases

- What happens if two requests from the same user arrive simultaneously (race condition)? The system must use atomic increment operations to prevent exceeding the limit due to concurrent requests.
- What happens if the usage tracking database call fails? The AI request should still be rejected (fail closed) — never allow an untracked request through.
- What happens when a user changes timezone? Quota resets are based on a fixed reference (UTC midnight), not the user's local timezone, to prevent timezone manipulation.
- What happens if the subscription tiers configuration is missing or malformed? The system should fall back to the free-tier default limit.
- What happens if a user's tier is set to an unrecognized value? The system should treat them as free tier and log a warning.
- What happens if the usage count check succeeds but the AI call itself fails? The question should still count toward the quota (the cost was incurred at the API level even if the response failed).

## Requirements _(mandatory)_

### Functional Requirements

**Usage Tracking**

- **FR-001**: The system MUST track the number of AI questions each user asks per calendar day (UTC).
- **FR-002**: Each usage record MUST capture: user identity, date, cumulative question count, and the AI model used.
- **FR-003**: The usage count MUST be incremented atomically to prevent race conditions from concurrent requests.
- **FR-004**: The usage check and increment MUST happen before the AI model is called — never after.

**Limit Enforcement**

- **FR-005**: Before processing an AI question, the system MUST check whether the user has remaining quota for the current day.
- **FR-006**: If the user has exceeded their daily limit, the system MUST reject the request with a structured, friendly error message that includes: the daily limit, the number used, and when the quota resets.
- **FR-007**: The system MUST fail closed — if the usage tracking system is unavailable (database error), AI requests MUST be rejected rather than allowed through untracked.
- **FR-008**: The daily quota MUST reset at midnight UTC each day. No manual intervention required.

**Subscription Tiers**

- **FR-009**: The system MUST support multiple subscription tiers, each with its own daily question limit.
- **FR-010**: At launch, two tiers MUST be configured: "free" (default: 30 questions/day) and "pro" (default: 100 questions/day).
- **FR-011**: Tier limits MUST be configurable without code changes (via environment variables or a configuration table).
- **FR-012**: Every user MUST have a subscription tier. Users without an explicit tier MUST default to "free".
- **FR-013**: When a user's tier changes, the new limit MUST take effect on their next request (no restart or cache clear needed). Their existing daily usage count is preserved.
- **FR-014**: Adding a new tier MUST NOT require code changes — only configuration updates.

**Quota Display**

- **FR-015**: The AI chat panel MUST display the user's remaining daily quota (e.g., "X of Y questions remaining today").
- **FR-016**: The quota display MUST update after each question is sent, without requiring a page refresh.
- **FR-017**: When remaining quota is low (at or below a warning threshold), the display MUST visually indicate urgency (e.g., color change).
- **FR-018**: When quota is exhausted, the chat panel MUST clearly communicate that the user cannot send more questions and when the reset occurs.
- **FR-019**: The quota display MUST reflect the user's actual tier limit (a pro user sees "X of 100", a free user sees "X of 30").

**Existing Behavior (no changes)**

- **FR-020**: The existing AI question-answering pipeline (RAG search, context building, streaming response) MUST remain unchanged.
- **FR-021**: The existing Quick (Flash) / Deep (Pro) mode toggle MUST continue to work.
- **FR-022**: The existing conversation history within a session MUST continue to work.
- **FR-023**: Both Quick and Deep mode questions MUST count equally toward the daily quota (one question = one count regardless of model).

### Key Entities

- **AI Usage Record**: Tracks a user's AI question count for a specific day. Key attributes: user identity, date, question count, model used for each query.
- **Subscription Tier**: Defines a usage level with a daily question limit. Key attributes: tier name (e.g., "free", "pro"), daily question limit. Configurable without code changes.
- **User Subscription**: Associates a user with their current subscription tier. Defaults to "free" if unset.

## Scope Boundaries

**In scope**:

- New database table for tracking per-user daily AI usage
- Subscription tier data model (user tier assignment + tier limit configuration)
- Rate limit check in the AI ask endpoint (before calling the AI model)
- Atomic increment of usage count
- Quota display in the AI chat panel (remaining/total + visual warning)
- Friendly limit-reached message in the chat panel
- Configurable tier limits (environment variables or database config)
- Fail-closed error handling

**Out of scope (future phases)**:

- Subscription billing integration (Stripe, payment processing)
- Admin dashboard UI for viewing usage analytics
- Per-model rate limiting (e.g., separate limits for Flash vs. Pro)
- Monthly or weekly quota periods (only daily for now)
- Rate limiting on non-AI endpoints (e.g., embedding, search)
- Usage-based pricing or pay-per-question model
- Email notifications when approaching or hitting limits
- Carry-over of unused quota between days

## Assumptions

- The AI ask endpoint (`/api/ai/ask`) is the single entry point for all AI questions — rate limiting this one route covers all AI usage.
- The existing Supabase auth pattern (`getAuthUserId()`) reliably identifies the current user for every AI request.
- UTC midnight is an acceptable reset boundary. Users in different timezones will experience reset at different local times, but this is standard practice and avoids timezone manipulation.
- The "pro" tier is a placeholder — no billing or upgrade flow exists yet. Tier assignment will be done manually in the database until a billing system is built.
- Environment variables are an acceptable configuration mechanism for tier limits at this stage. A database-driven config table can be added later if needed.
- Both Quick (Flash) and Deep (Pro) model questions count as one question each toward the daily limit. There is no weighted counting based on model cost.
- The usage tracking table will be small enough that no special indexing beyond the primary key and a composite index on (user_id, date) is needed for performance.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: No user can exceed their tier's daily AI question limit — 100% enforcement rate with zero bypass under normal operation.
- **SC-002**: Users see their remaining quota in the AI chat panel before and after every question — the count is always accurate within 1 second of a question being sent.
- **SC-003**: When a user hits their limit, 100% of subsequent requests are rejected with the friendly message — no cryptic errors, no silent failures, no partial responses.
- **SC-004**: Quota resets automatically at the start of each new day (UTC) with zero manual intervention.
- **SC-005**: Changing a user's subscription tier takes effect on their next AI request — no restart, no cache clear, no delay.
- **SC-006**: All existing AI functionality (RAG search, streaming responses, Quick/Deep modes, citations, conversation history) continues to work without regression for users within their quota.
- **SC-007**: Concurrent requests from the same user never result in exceeding the daily limit (atomic increment prevents race conditions).
