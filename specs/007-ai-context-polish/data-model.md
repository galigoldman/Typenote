# Data Model: AI Context Polish

**Feature**: 007-ai-context-polish
**Date**: 2026-03-15

## Summary

No new tables or migrations. This feature modifies the data flowing through existing interfaces — specifically the parameters passed to the AI API and the system prompt construction.

## Modified Interfaces

### askQuestion() Parameters (Extended)

Current:
```typescript
type QuestionParams = {
  question: string;
  courseId: string;
  weekId?: string;
  documentId?: string;
  mode: 'quick' | 'deep';
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
};
```

New fields:
```typescript
type QuestionParams = {
  // ... existing fields ...
  courseName?: string;      // Human-readable course name for prompt
  weekLabel?: string;        // e.g., "Week 5" or "שבוע 5"
  documentContent?: string;  // Serialized text from student's current document
};
```

### System Prompt (Dynamic)

Current: Static `SYSTEM_PROMPT` constant in `prompts.ts`.

New: `buildSystemPrompt()` function accepting context:
```typescript
function buildSystemPrompt(context: {
  courseName?: string;
  weekLabel?: string;
  hasDocumentContent: boolean;
}): string;
```

## Existing Tables Referenced (No Changes)

### content_embeddings
- Used by embedding cleanup (delete rows on material deletion)
- No schema changes

### courses / course_weeks
- Read-only: course name and week label used for prompt context
- No schema changes

### documents
- Read-only: document content extracted for AI context
- No schema changes
