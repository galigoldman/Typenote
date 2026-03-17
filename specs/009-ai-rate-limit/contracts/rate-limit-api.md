# API Contract: AI Rate Limiting

**Feature**: 009-ai-rate-limit
**Date**: 2026-03-17

## New Endpoint: GET /api/ai/quota

Returns the current user's AI usage quota for today.

### Request

```
GET /api/ai/quota
Cookie: (Supabase session)
```

No body or query parameters.

### Response (200)

```json
{
  "used": 12,
  "limit": 30,
  "remaining": 18,
  "tier": "free",
  "resetsAt": "2026-03-18T00:00:00.000Z"
}
```

| Field       | Type   | Description                                        |
| ----------- | ------ | -------------------------------------------------- |
| `used`      | number | Questions used today                               |
| `limit`     | number | Daily limit for this user's tier                   |
| `remaining` | number | Questions remaining (`limit - used`, min 0)        |
| `tier`      | string | User's subscription tier (e.g., "free", "pro")     |
| `resetsAt`  | string | ISO 8601 timestamp of next midnight UTC            |

### Response (401)

```json
{ "error": "Unauthorized" }
```

### Response (500)

```json
{ "error": "Failed to fetch quota" }
```

---

## Modified Endpoint: POST /api/ai/ask

### Changes from current

- **New behavior**: Before calling the AI model, the route checks and increments the user's daily usage count via the `increment_ai_usage` RPC.
- **New error response (429)**: When the user has exceeded their daily limit.
- **Request body**: No changes.
- **Streaming response**: No changes to the SSE format.

### New Error Response (429 — Rate Limited)

Returned instead of starting the SSE stream when the user's quota is exhausted.

```json
{
  "error": "rate_limited",
  "message": "You've used all 30 of your daily AI questions. Your quota resets at midnight UTC.",
  "used": 30,
  "limit": 30,
  "resetsAt": "2026-03-18T00:00:00.000Z"
}
```

| Field      | Type   | Description                                      |
| ---------- | ------ | ------------------------------------------------ |
| `error`    | string | Always `"rate_limited"` for quota exhaustion     |
| `message`  | string | User-friendly message (can be displayed directly)|
| `used`     | number | Total questions used today                       |
| `limit`    | number | Daily limit for this user's tier                 |
| `resetsAt` | string | ISO 8601 timestamp of next midnight UTC          |

### New Error Response (503 — Rate Limit Check Failed)

Returned when the rate limit check itself fails (database error). Fail-closed behavior.

```json
{
  "error": "service_unavailable",
  "message": "AI service is temporarily unavailable. Please try again in a moment."
}
```

### Updated Request Flow

```
1. Validate request body (existing)
2. Authenticate user via getAuthUserId() (existing)
3. NEW: Call increment_ai_usage(user_id, mode)
   → If RPC fails → return 503
   → If is_allowed = false → return 429 with quota info
   → If is_allowed = true → continue
4. Build AI context (existing)
5. Stream Gemini response (existing)
```

---

## Client-Side Contract: Quota Indicator

The AI chat panel component will:

1. **On mount**: Fetch `GET /api/ai/quota` and display remaining count.
2. **After each question**: Optimistically decrement local counter by 1.
3. **On 429 response**: Display the `message` field from the error response and disable input.
4. **Low quota warning**: When `remaining <= 5`, change indicator color to amber/red.
5. **Exhausted state**: When `remaining === 0`, show the limit-reached message and disable the input field.
