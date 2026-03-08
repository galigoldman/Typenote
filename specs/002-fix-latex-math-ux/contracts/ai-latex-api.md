# API Contract: POST /api/ai/latex (Unchanged)

**Feature**: 002-fix-latex-math-ux
**Date**: 2026-03-08

## Overview

No changes to the existing API contract. The POST `/api/ai/latex` endpoint remains identical to the 001 implementation. It is reused by the edit feature when the user modifies the natural language expression.

## Existing Contract (from 001)

### Request

```
POST /api/ai/latex
Content-Type: application/json

{
  "text": "one half times five"   // 1-500 characters, non-empty
}
```

### Success Response

```
200 OK
Content-Type: application/json

{
  "latex": "\\frac{1}{2} \\times 5"
}
```

### Error Responses

| Status | Body                                                | Condition               |
| ------ | --------------------------------------------------- | ----------------------- |
| 400    | `{ "error": "Text is required" }`                   | Empty or missing `text` |
| 400    | `{ "error": "Text too long (max 500 characters)" }` | `text.length > 500`     |
| 500    | `{ "error": "Conversion failed" }`                  | AI service error        |

## Usage in 002

The existing endpoint is called in two scenarios:

1. **New math creation** (same as 001): User types `$`, enters text, presses Enter
2. **Expression edit** (new in 002): User clicks existing math, edits natural language text, presses Enter — only if text differs from `originalText`

No changes to request/response format, validation, or error handling.
