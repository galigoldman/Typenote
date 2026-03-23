# API Contract: Rate Limiting & Quota Endpoints

**Date**: 2026-03-23
**Feature**: 014-beta-latex-limits

## POST /api/ai/latex (modified)

### Request

```json
{
  "text": "integral from 0 to infinity of e to the minus x",
  "courseName": "Calculus II" // NEW — optional
}
```

| Field        | Type   | Required | Constraints                                           |
| ------------ | ------ | -------- | ----------------------------------------------------- |
| `text`       | string | yes      | 1-500 chars, non-empty                                |
| `courseName` | string | no       | Max 200 chars. Omitted if document is not in a course |

### Response (200)

```json
{
  "latex": "\\int_0^\\infty e^{-x} \\, dx"
}
```

### Response (429 — LaTeX quota exceeded)

```json
{
  "error": "Monthly LaTeX quota exceeded",
  "quota": {
    "used": 500,
    "limit": 500,
    "tier": "beta",
    "resetsAt": "2026-04-01T00:00:00.000Z"
  }
}
```

## POST /api/ai/ask (modified — deep mode restriction)

### New behavior

When `mode: "deep"` is sent by a non-pro user:

### Response (403 — deep mode restricted)

```json
{
  "error": "deep_mode_restricted",
  "message": "Deep mode is available on the Pro plan. Your current plan is 'beta'.",
  "tier": "beta"
}
```

All other request/response behavior unchanged.

## GET /api/ai/quota (modified)

### Response (200 — updated shape)

```json
{
  "chat": {
    "used": 42,
    "limit": 100,
    "remaining": 58
  },
  "latex": {
    "used": 123,
    "limit": 500,
    "remaining": 377
  },
  "tier": "beta",
  "resetsAt": "2026-04-01T00:00:00.000Z",
  "deepModeAvailable": false
}
```

| Field               | Type    | Description                                              |
| ------------------- | ------- | -------------------------------------------------------- |
| `chat.used`         | number  | Chat questions used this month                           |
| `chat.limit`        | number  | Chat question limit for tier                             |
| `chat.remaining`    | number  | `limit - used` (min 0)                                   |
| `latex.used`        | number  | LaTeX conversions used this month                        |
| `latex.limit`       | number  | LaTeX conversion limit for tier                          |
| `latex.remaining`   | number  | `limit - used` (min 0)                                   |
| `tier`              | string  | User's subscription tier                                 |
| `resetsAt`          | string  | ISO 8601 timestamp of next reset (1st of next month UTC) |
| `deepModeAvailable` | boolean | Whether deep mode is available for this tier             |

### Breaking change note

The response shape changes from flat `{ used, limit, remaining, tier, resetsAt }` to nested `{ chat: {...}, latex: {...}, tier, resetsAt, deepModeAvailable }`. The AI chat panel component must be updated to match.
