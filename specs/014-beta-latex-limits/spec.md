# Feature Specification: Beta Tester AI Limits & LaTeX Quota Separation

**Feature Branch**: `014-beta-latex-limits`
**Created**: 2026-03-23
**Status**: Draft
**Input**: User description: "Beta testers arriving soon — need free monthly AI limits, separate LaTeX quota with thin queries on Flash, and course name context for LaTeX."

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Beta Tester Gets a Generous Free AI Allowance (Priority: P1)

A beta tester signs up for Typenote and starts using the AI tutor chat to study for their courses. They don't pay anything, but they get a meaningful monthly quota of AI chat questions — enough to genuinely evaluate the product and form study habits, but bounded so costs stay controlled during the beta period.

**Why this priority**: This is the foundational requirement. Without a beta tier, testers either hit the stingy free-tier limit (50/month) and churn, or the system has no limits at all and costs spiral. Getting this right determines whether beta testing produces useful feedback.

**Independent Test**: Can be fully tested by assigning a user the "beta" tier and verifying they can ask AI chat questions up to the beta limit, then get a clear message when the limit is reached.

**Acceptance Scenarios**:

1. **Given** a new beta tester signs up, **When** their account is created, **Then** their subscription tier is set to "beta" and their monthly AI chat quota reflects the beta limit.
2. **Given** a beta tester has used all their monthly chat questions, **When** they try to ask another question, **Then** they see a friendly message explaining they've hit their limit for the month and when it resets.
3. **Given** a beta tester used their full quota last month, **When** a new calendar month begins, **Then** their chat quota resets to zero and they can ask questions again.

---

### User Story 2 - LaTeX Conversions Have Their Own Separate Quota (Priority: P1)

A student is taking notes in class and frequently uses the LaTeX input feature to convert natural language like "integral from 0 to infinity of e to the minus x" into proper math notation. These conversions are lightweight and cheap, but currently they eat into the same monthly quota as the heavy AI chat questions. The student should have a generous, separate LaTeX quota so they never feel penalized for using math notation while studying.

**Why this priority**: Co-equal with P1 because LaTeX and chat serve fundamentally different use cases at different cost levels. Lumping them together punishes math-heavy users and distorts cost projections. Separating them is essential for both fairness and financial planning.

**Independent Test**: Can be fully tested by making LaTeX conversion calls and AI chat calls, then verifying that each type only increments its own counter and enforces its own limit independently.

**Acceptance Scenarios**:

1. **Given** a user has used all their monthly chat questions, **When** they attempt a LaTeX conversion, **Then** the conversion succeeds because the LaTeX quota is tracked separately.
2. **Given** a user has used all their monthly LaTeX conversions, **When** they attempt to ask an AI chat question, **Then** the chat question succeeds because the chat quota is tracked separately.
3. **Given** a user makes a LaTeX conversion, **When** they check their quota display, **Then** they see separate counters for "Chat questions" and "LaTeX conversions" with independent limits and usage numbers.
4. **Given** a beta tester, **When** they check their LaTeX quota, **Then** the LaTeX limit is significantly higher than the chat limit (reflecting the lower cost per query).

---

### User Story 3 - LaTeX Queries Include Course Context for Better Results (Priority: P2)

A student is in their "Linear Algebra" course and types "the determinant of a 2 by 2 matrix" into the LaTeX input box. Because the system now passes the course name to the LaTeX AI, the model has just enough context to produce notation consistent with the course's conventions (e.g., using `\det` vs `|A|`, or knowing "matrix" means a proper bracket notation in a math course).

**Why this priority**: This is a quality improvement, not a gating feature. The LaTeX conversion already works without course context. Adding the course name is a low-cost enhancement that improves accuracy for ambiguous expressions.

**Independent Test**: Can be tested by calling the LaTeX endpoint with and without a course name and comparing the results for ambiguous expressions where domain context matters.

**Acceptance Scenarios**:

1. **Given** a student is editing a document inside the "Calculus II" course, **When** they request a LaTeX conversion, **Then** the system includes the course name in the AI query.
2. **Given** a student is editing a document that is not associated with any course, **When** they request a LaTeX conversion, **Then** the conversion still works normally without course context.
3. **Given** the course name is provided, **When** the LaTeX AI processes the query, **Then** the prompt remains minimal (course name adds only a brief context hint, not a large system prompt change) to keep the query lightweight and cheap.

---

### User Story 4 - Quota Display Shows Both Chat and LaTeX Usage (Priority: P2)

A student opens the AI chat panel and sees a clear breakdown of their usage: how many chat questions and LaTeX conversions they've used this month, out of how many, and when the quota resets. This transparency helps them pace their usage and understand the product's limits.

**Why this priority**: Important for user trust and self-management, but the system works without it (users just hit limits without seeing them coming). Builds on the existing quota display in the chat panel.

**Independent Test**: Can be tested by checking that the quota display renders two separate bars/counters and that the numbers update after each chat or LaTeX query.

**Acceptance Scenarios**:

1. **Given** a user opens the AI chat panel, **When** the quota display loads, **Then** it shows separate usage for "Chat" and "LaTeX" with current/limit numbers for each.
2. **Given** a user makes a LaTeX conversion from the editor, **When** they open the AI chat panel, **Then** the LaTeX usage counter reflects the new conversion.

---

### Edge Cases

- What happens when a user's tier is changed from "beta" to "free" mid-month? Their remaining quota should immediately reflect the new tier's limits. If they've already exceeded the free limit, subsequent requests are denied.
- What happens if a LaTeX conversion fails after the quota was already incremented? The usage count still increments (fail-closed — same as current chat behavior). This prevents gaming via intentional failures.
- What happens when a user has no course association (document outside a course) and requests LaTeX? The system omits the course context from the prompt and processes the conversion normally.
- What happens if the LaTeX quota counter and chat quota counter overlap in the database (same user, same month)? They must be stored as distinct records, distinguishable by query type.
- What happens when a beta or free user selects "deep" (Pro) mode? The system MUST reject the request with a clear message that deep mode is available only on paid plans. The UI should either hide the deep mode toggle or show it as a locked/upgrade prompt.

## Clarifications

### Session 2026-03-23

- Q: Should limits be based on tokens/cost or question counts? → A: Question-based limits for enforcement. Token counts stored as fire-and-forget after each AI call for observability only (not used for limiting).
- Q: How should admins view per-user usage? → A: SQL view only — a pre-written query runnable in the Supabase dashboard. Shows query counts and token totals per user per month per type. No admin API or UI needed for beta.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST support a "beta" subscription tier with its own monthly chat question limit, configurable via environment variable (`AI_LIMIT_BETA`), defaulting to 100 questions per month.
- **FR-002**: System MUST track LaTeX conversion usage separately from AI chat usage, using a distinct query type identifier.
- **FR-003**: System MUST enforce a separate monthly LaTeX quota per tier: beta defaults to 500/month, free defaults to 150/month, pro defaults to 1500/month — all configurable via environment variables (`AI_LATEX_LIMIT_{TIER}`).
- **FR-004**: The LaTeX AI prompt MUST include the course name when available, appended as a brief context line (e.g., "Course: Linear Algebra") without expanding the system prompt significantly.
- **FR-005**: The LaTeX endpoint MUST continue using the lightweight Flash model to keep per-query costs minimal.
- **FR-006**: The quota display MUST show both chat and LaTeX usage separately, with per-type current usage, limit, and reset date.
- **FR-007**: The rate limit enforcement MUST remain atomic (check-and-increment in a single database operation) for both chat and LaTeX quotas.
- **FR-008**: System MUST allow the beta tier's limits to be adjusted without code changes (via environment variables), following the existing twelve-factor pattern.
- **FR-009**: The existing "free" and "pro" tier behavior for chat MUST remain unchanged (50 and 500 respectively, unless overridden by env vars).
- **FR-010**: Deep mode (Pro model) MUST be restricted to paid tiers only. Beta and free users MUST only have access to quick mode (Flash model). Attempting deep mode on a non-paid tier MUST return a clear error indicating this is a paid feature.
- **FR-011**: The UI MUST visually indicate that deep mode is unavailable for non-paid tiers — either by hiding the toggle, disabling it, or showing an upgrade prompt.
- **FR-012**: System MUST record cumulative token counts (input + output) per user per month per query type via a fire-and-forget database update after each AI call. This data is for admin observability only — not used for enforcement. If the update fails, the query still succeeds.
- **FR-013**: An admin MUST be able to view per-user usage data (query counts and token totals, chat and LaTeX separately) for any given month via a pre-written SQL view in the Supabase dashboard. No admin API or UI is required.

### Assumptions

- Beta testers will be manually assigned the "beta" tier (either via database update or an admin action). Automated beta enrollment is out of scope.
- The beta tier chat limit of 100/month is a starting point — 2x the free tier. Enough for beta testers to evaluate the product without excess. The env var override makes this tunable without redeployment.
- LaTeX limits are set higher than chat limits because LaTeX queries use the Flash model with minimal prompts (~155 input tokens per query vs. ~7,000 for chat with RAG context). The cost per LaTeX query is roughly 15x cheaper than a chat query (~$0.0002 vs ~$0.003).
- Deep mode (Gemini Pro) is reserved for paid tiers only. Beta and free users get Flash-only chat. The UI shows deep mode as visibly blocked/locked.
- The "beta" tier is temporary — it will eventually be removed or merged into a permanent tier structure once pricing is finalized.

### Cost Projections

Estimated monthly cost per beta user (Flash-only, Gemini 2.5 Flash pricing):

| Query Type | Limit | Cost/Query | 100% Usage | 60% Realistic |
|---|---|---|---|---|
| LaTeX (Flash) | 500 | $0.0002 | $0.10 | $0.06 |
| Chat Quick (Flash) | 100 | $0.003 | $0.30 | $0.18 |
| Chat Deep (Pro) | blocked | — | $0.00 | $0.00 |
| **Total** | | | **$0.40** | **$0.24** |

At 50 beta users with 60% utilization: **~$12/month**.

### Key Entities

- **Subscription Tier**: A label on the user's profile that determines their quota limits. Current values: "free", "pro". New value: "beta". Each tier has independent limits for chat and LaTeX.
- **AI Usage Record**: A per-user, per-month, per-query-type record tracking how many queries of each type have been made. Currently tracks a single counter; will be extended to distinguish "chat" vs "latex" query types. Also stores cumulative token counts (input + output) updated asynchronously after each AI call for admin observability.
- **Quota Info**: The read-only view of a user's current usage, combining chat and LaTeX counters with their respective limits and reset dates.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Beta testers can use the AI chat for up to 100 questions per month (default) without payment, and usage resets correctly on the 1st of each month.
- **SC-002**: A math-heavy user can perform at least 500 LaTeX conversions per month (beta tier default) without any of those conversions reducing their chat quota.
- **SC-003**: LaTeX conversion queries remain lightweight — the added course context increases prompt size by no more than 30 tokens on average.
- **SC-004**: Users can see their remaining chat and LaTeX quotas in the UI before hitting limits, enabling self-pacing.
- **SC-005**: Tier limits can be changed within minutes via environment variables, without requiring code changes or deployments.
