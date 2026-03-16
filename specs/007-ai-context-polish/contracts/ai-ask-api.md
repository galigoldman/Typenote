# API Contract: POST /api/ai/ask (Updated)

**Feature**: 007-ai-context-polish
**Date**: 2026-03-15

## Changes from current

- Added `courseName`, `weekLabel`, `documentContent` to request body
- System prompt is now dynamic (includes course/week context)
- Document content is injected as a labeled turn in conversation

## Request

```
POST /api/ai/ask
Content-Type: application/json
```

### Body

```json
{
  "question": "Help me with problem 3",
  "courseId": "uuid",
  "weekId": "uuid",
  "mode": "quick",
  "courseName": "Linear Algebra",
  "weekLabel": "Week 5",
  "documentContent": "My solution to problem 3:\nLet A be a 3x3 matrix...",
  "conversationHistory": [
    { "role": "user", "content": "..." },
    { "role": "assistant", "content": "..." }
  ]
}
```

### Field descriptions

| Field               | Type              | Required | Description                                              |
| ------------------- | ----------------- | -------- | -------------------------------------------------------- |
| question            | string            | Yes      | The student's question                                   |
| courseId            | string (UUID)     | Yes      | Course to search within                                  |
| weekId              | string (UUID)     | No       | Week context (informational, search is course-wide)      |
| mode                | "quick" \| "deep" | Yes      | Model selection                                          |
| courseName          | string            | No       | Course name for prompt context                           |
| weekLabel           | string            | No       | Week label for prompt context (e.g., "Week 5")           |
| documentContent     | string            | No       | Student's current document text (truncated to 50K chars) |
| conversationHistory | Array             | No       | Previous messages in session                             |

## Response

No changes to response format:

```json
{
  "answer": "Based on your Week 5 Linear Algebra materials...",
  "sources": [
    {
      "sourceType": "moodle_file",
      "sourceName": "Lecture 5 Slides.pdf",
      "weekId": "uuid",
      "pageRange": null
    }
  ],
  "model": "flash",
  "cached": false
}
```

## Behavior changes

1. **System prompt**: Dynamically generated with course name and week label
2. **Document content**: If provided, injected as a labeled user turn before course materials:
   ```
   "Here is the student's current document:\n\n{documentContent}\n\nReview it to understand their work."
   ```
3. **Search scope**: Always course-wide (weekId is for prompt context only, not search filtering)
