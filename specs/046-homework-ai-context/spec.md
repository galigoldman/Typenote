# Feature Specification: Homework AI Context

**Feature Branch**: `046-homework-ai-context`
**Created**: 2026-05-23
**Status**: Draft
**Input**: User description: "I want us to have inside of a course a 'start homework' button next to the 'new document' and when you press on start homework, let the user choose the exercise (from the course's documents) and the relevant lectures + recitations + material. Then, the AI chat will have this material as context. It opens a regular document and the chat inside knows what are the questions, and the material they are based on. So the student can ask in the chat 'in question 2 what did they mean...' and the AI will know the context."

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Start a Homework Session (Priority: P1)

A student opens a course page and clicks "Start Homework" (next to the existing "New Document" button). A dialog appears letting them select:
1. The exercise document — an existing document in the course that contains the homework questions.
2. The relevant reference materials — lectures, recitations, and/or uploaded materials from the course that the homework is based on.

After selecting and confirming, a new document is created and opened. The AI chat panel in this document is pre-loaded with context from both the exercise questions and the selected reference materials, so the student can immediately ask questions like "in question 2, what did they mean by..." and the AI understands exactly what they're referring to.

**Why this priority**: This is the core value proposition — without the ability to start a homework session with context, the feature has no purpose.

**Independent Test**: Can be fully tested by clicking "Start Homework", selecting an exercise and materials, and verifying that the new document opens with the AI chat aware of the selected context.

**Acceptance Scenarios**:

1. **Given** a student is on a course page with at least one existing document and some course materials, **When** they click "Start Homework", **Then** a dialog appears showing a list of the course's documents to pick as the exercise and a list of available materials (lectures, recitations, uploaded files) to select as references.
2. **Given** the student has selected an exercise document and at least one reference material, **When** they click "Start" (confirm), **Then** a new document is created in the course and the student is navigated to it.
3. **Given** the student is now in the newly created homework document, **When** they open the AI chat and ask a question referencing a specific part of the exercise (e.g., "what does question 3 mean?"), **Then** the AI responds with awareness of the exercise content and the selected reference materials.

---

### User Story 2 - AI Understands Exercise Questions in Context (Priority: P2)

When the student asks the AI about a specific question from the exercise, the AI can reference both the question text and the relevant lecture/material content to provide a helpful explanation. The AI does not solve the homework — it helps the student understand the questions and the underlying concepts.

**Why this priority**: This is the educational value — the AI must be able to connect exercise questions to course material for the feature to be useful.

**Independent Test**: Can be tested by asking the AI about a specific exercise question and verifying the response references both the question and relevant material.

**Acceptance Scenarios**:

1. **Given** a homework document with exercise context about linear algebra and a linked lecture on matrix operations, **When** the student asks "in question 2, what do they mean by 'orthogonal projection'?", **Then** the AI explains the concept using information from the linked lecture material.
2. **Given** a homework document with exercise context, **When** the student asks the AI to solve a question directly, **Then** the AI guides the student toward understanding rather than providing a direct answer.

---

### User Story 3 - View and Manage Homework Context (Priority: P3)

The student can see which exercise and materials are linked to their homework document. They can view the linked context from within the document so they know what the AI has access to.

**Why this priority**: Transparency about what context the AI has builds trust and helps the student understand what materials they should also review.

**Independent Test**: Can be tested by opening a homework document and verifying the linked exercise and materials are visible.

**Acceptance Scenarios**:

1. **Given** a homework document that was created via "Start Homework", **When** the student views the AI chat panel, **Then** they can see which exercise document and which materials are linked as context.
2. **Given** a homework document with linked context, **When** the student reopens the document in a later session, **Then** the linked context is still present and the AI still has access to it.

---

### Edge Cases

- What happens when the course has no documents to select as an exercise? The "Start Homework" button should still be visible, but the dialog should show a message explaining that at least one document is needed as the exercise source.
- What happens when the course has no materials (lectures/recitations)? The student should still be able to start a homework session with just the exercise document — reference materials are optional.
- What happens when the selected exercise document is later deleted? The homework document should still function as a normal document, but the AI context about the exercise will show as unavailable.
- What happens if the exercise document is very long (many pages)? The system should handle large documents by including all content as context, subject to existing AI context limits.
- What happens when the student opens a homework document on a different device? The linked context should persist since it's stored with the document, not in the browser.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST display a "Start Homework" button on the course page, positioned next to the existing "New Document" button.
- **FR-002**: System MUST present a dialog when "Start Homework" is clicked, allowing the student to select one exercise document from the course's existing documents.
- **FR-003**: System MUST allow the student to optionally select one or more reference materials (lectures, recitations, uploaded files, personal files) from the course in the same dialog.
- **FR-004**: System MUST create a new document in the course when the student confirms their selections.
- **FR-005**: System MUST automatically name the new homework document based on the selected exercise (e.g., "HW — [Exercise Name]").
- **FR-006**: System MUST navigate the student to the newly created document after creation.
- **FR-007**: System MUST pass the exercise content and selected reference materials as context to the AI chat for that document.
- **FR-008**: System MUST persist the homework context association so it survives page reloads and future sessions.
- **FR-009**: The AI chat MUST use the exercise content and reference materials when answering questions, enabling it to understand references to specific questions or sections.
- **FR-010**: The AI chat MUST display indicators showing which exercise and materials are linked as context.
- **FR-011**: System MUST allow starting a homework session with only an exercise document (no reference materials required).
- **FR-012**: The "Start Homework" dialog MUST show a helpful message when the course has no documents available to select as an exercise.

### Key Entities

- **Homework Session**: A link between a homework document, an exercise source document, and zero or more reference materials. Belongs to a course and a student.
- **Exercise Source**: An existing document in the course that contains the homework questions. One per homework session.
- **Reference Material**: A lecture, recitation, uploaded file, or personal file from the course that provides background context. Zero or more per homework session.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Students can go from clicking "Start Homework" to asking their first AI question about the exercise in under 60 seconds.
- **SC-002**: 90% of students who start a homework session successfully complete the setup flow (select exercise, optionally select materials, confirm) on first attempt.
- **SC-003**: AI responses to questions referencing specific exercise items (e.g., "question 2") correctly incorporate content from both the exercise and linked materials.
- **SC-004**: Homework context persists across sessions — a student returning to the document later still has the same AI context available.

## Assumptions

- The exercise document is an existing document within the same course. Students do not upload a new file as the exercise — they use a document already in the course (which may have been created from an imported file).
- Reference materials include course materials (from weeks), Moodle-imported files, and personal uploaded files — all content types already available in the course.
- The AI's role is educational guidance, not solving homework. The system prompt will instruct the AI to help with understanding, not provide direct answers.
- The existing AI rate-limiting and quota system applies to homework sessions — no special quota treatment.
- The homework document is a regular document with additional metadata linking it to its exercise and materials. It functions normally even if context is removed.
