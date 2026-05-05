# Feature Specification: Fix Region Capture Error

**Feature Branch**: `017-fix-region-capture`
**Created**: 2026-03-23
**Status**: Draft
**Input**: User description: "Fix 'Region capture failed: {}' error when using Ask AI -> Screenshot crop tool"

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Screenshot Region for AI (Priority: P1)

A user opens a document in the canvas editor, clicks "Ask AI" -> "Screenshot", draws a crop rectangle over a region of the page, and clicks the "Ask AI" button that appears above the crop. The system captures the selected region as an image and sends it to the AI chat.

**Why this priority**: This is the broken flow. Currently it throws "Region capture failed: {}" and no image is sent to AI.

**Independent Test**: Open any document with content, use Ask AI -> Screenshot, draw a region, click the Ask AI button — the AI chat should receive the screenshot without errors.

**Acceptance Scenarios**:

1. **Given** a document with drawings and text, **When** the user uses Ask AI -> Screenshot and selects a region, **Then** the screenshot is captured and sent to the AI chat without errors.
2. **Given** a document with a PDF background, **When** the user screenshots a region, **Then** the capture includes the PDF content in the image.
3. **Given** a very small crop region (less than 20px), **When** the user tries to capture, **Then** the system silently ignores it (no error shown).

### Edge Cases

- What happens when the page has canvas elements with cross-origin content? The capture should handle tainted canvases gracefully.
- What happens when the page element ref is not available? The function should silently return without error.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The "Ask AI -> Screenshot" crop-to-AI flow MUST successfully capture the selected region as an image.
- **FR-002**: The captured image MUST be sent to the AI chat panel for context.
- **FR-003**: The system MUST NOT show console errors during normal screenshot capture.
- **FR-004**: If the capture fails for any reason, the system MUST show a user-friendly message rather than a raw error.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: The Ask AI -> Screenshot flow completes successfully 100% of the time on documents with standard content (text, drawings, PDF backgrounds).
- **SC-002**: No console errors appear during the screenshot capture flow.

## Assumptions

- The root cause is likely related to html-to-image library failing to capture canvas elements or encountering cross-origin restrictions.
- The fix should be isolated to the `handleAskAiWithRegion` function in the canvas editor.
