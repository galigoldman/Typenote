# Research: Homework AI Context

## Decision 1: How to Store Homework Context Associations

**Decision**: New `homework_sessions` table + `homework_session_materials` junction table.

**Rationale**: The homework session links a homework document to an exercise source document and zero or more reference materials. Materials are polymorphic — they can be `course_materials`, `personal_files`, or other `documents`. A normalized relational model with a junction table is the cleanest approach, follows the existing codebase pattern (e.g., `ai_conversations` + `ai_messages`, `document_versions`), and is a strong interview topic (normalization, junction tables, polymorphic associations).

**Alternatives considered**:
- **JSONB column on `documents`** (e.g., `homework_context: { exercise_document_id, material_ids: [...] }`): Simpler but loses FK constraints, makes querying relationships harder, and mixes concerns. Rejected because the codebase already uses dedicated tables for related entities.
- **Extending the existing `purpose` field**: Too limited — `purpose` is just a label (`homework`, `summary`, `notes`). It doesn't carry relational data. Could add `exercise_document_id` as a column, but the many-to-many materials relationship still needs a junction table.

---

## Decision 2: How to Inject Homework Context into AI Chat

**Decision**: Pass `homeworkSessionId` through the component tree to the `/api/ai/ask` route, which fetches exercise content and material text server-side and injects them as synthetic conversation turns (same pattern as existing document content and RAG results).

**Rationale**: The existing AI pipeline already injects context via synthetic user/model exchanges in the Gemini `contents` array (see `buildAiContext` in `src/lib/actions/ai-context.ts`). Adding homework context follows the same pattern — the exercise document text and material text are prepended as additional context turns. This keeps all context assembly server-side (secure, no client-side file fetching) and leverages the existing streaming SSE architecture.

**Alternatives considered**:
- **Client-side context injection**: Pass exercise/material text from client. Rejected — requires fetching potentially large files client-side, exposes content in network requests, and duplicates server-side logic.
- **RAG-only approach (use existing embeddings)**: Rely entirely on pgvector search to find relevant chunks. Rejected — RAG is probabilistic and might miss specific questions. For homework, we want the full exercise text injected directly so the AI can reference "question 2" precisely. RAG can supplement but shouldn't be the only mechanism.

---

## Decision 3: How to Build the Homework System Prompt

**Decision**: Extend `buildSystemPrompt` with an optional `isHomeworkMode` flag that adds homework-specific instructions to the system prompt (don't solve directly, help understand, reference specific questions by number).

**Rationale**: The existing `buildSystemPrompt` in `src/lib/ai/prompts.ts` already accepts optional context parameters (`courseName`, `weekLabel`, `hasDocumentContent`). Adding `isHomeworkMode` is consistent with this pattern. The homework prompt additions instruct the AI to be pedagogical rather than solution-oriented.

**Alternatives considered**:
- **Completely separate prompt builder**: Unnecessary duplication. The base prompt is 90% the same.
- **Prompt in the API route directly**: Scatters prompt logic. The existing pattern keeps all prompts in `prompts.ts`.

---

## Decision 4: Material Selection UI Pattern

**Decision**: Multi-step dialog with two sections — exercise picker (single-select from course documents) and materials picker (multi-select from course materials, personal files, and optionally other documents). Uses checkboxes for multi-select with a grouped layout (by week).

**Rationale**: The existing `CreateDocumentDialog` uses a simple form with selects. The homework dialog needs more — it's selecting from lists of existing items rather than filling in new data. A grouped checkbox list follows shadcn/ui patterns and handles the "zero or more materials" requirement naturally.

**Alternatives considered**:
- **Two separate dialogs (pick exercise, then pick materials)**: More steps for the user. Rejected — one dialog with two sections is faster.
- **Combobox/search-based**: Overkill for typical course sizes (5-30 items). Simple scrollable lists are sufficient.

---

## Decision 5: Where to Show Homework Context in the AI Panel

**Decision**: Add a collapsible "Homework Context" section at the top of the AI chat panel (above messages) that shows the linked exercise name and material names as badges. This section only appears for homework documents.

**Rationale**: The user needs transparency about what the AI "knows" (spec FR-010). A non-intrusive collapsible section doesn't interfere with the chat flow but is always accessible. Badges are compact and scannable.

**Alternatives considered**:
- **Tooltip on the AI bubble**: Too hidden — users might not discover it.
- **Separate tab/panel**: Over-engineered for showing a short list of linked items.

---

## Decision 6: Polymorphic Material References

**Decision**: Use `material_type` discriminator + `material_id` UUID in the junction table. Valid types: `'course_material'`, `'personal_file'`, `'document'`.

**Rationale**: Materials come from three different tables (`course_materials`, `personal_files`, `documents`). A polymorphic reference with a type discriminator is simpler than three separate FK columns (most of which would be NULL). This is a common pattern in production systems and a good interview discussion point (polymorphic associations, trade-offs vs. table-per-type).

**Trade-off**: No database-level FK constraint on `material_id`. Application-level validation ensures referential integrity. If a referenced material is deleted, the junction row becomes orphaned — the UI handles this gracefully by showing "Material unavailable" (spec edge case).
