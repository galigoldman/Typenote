# Tasks: Fix Paste Content Page Splitting

**Branch**: `026-fix-paste-page-split`
**Plan**: [plan.md](./plan.md)

## Phase 1: Setup

- [x] **T-001**: Verify development environment

## Phase 2: Tests First (TDD)

- [x] **T-002**: Extract overflow split logic into `findOverflowSplitIndex` in `src/lib/canvas/text-split.ts`
- [x] **T-003**: Write unit tests in `src/lib/canvas/__tests__/overflow-utils.test.ts` (9 tests)

## Phase 3: Core Implementation

- [x] **T-004**: Use `scrollHeight` + `offsetTop`/`offsetHeight` instead of `coordsAtPos` for overflow detection (coordsAtPos returns clipped coords with overflow:hidden)
- [x] **T-005**: Extract ALL overflowing blocks at once using `findOverflowSplitIndex`
- [x] **T-006**: Reset hysteresis gate after successful split to enable cascade
- [x] **T-007**: Fix `handleTextOverflow` to use `pagesRef.current` instead of `setPages` updater for reading state (React 19 automatic batching defers updater execution)
- [x] **T-008**: Fix `focusPage` to call `setContent()` for new pages (fires `onUpdate` → enables cascade)

## Phase 4: Integration & Verification

- [x] **T-009**: Run full test suite — 75 files, 693 tests passing
- [x] **T-010**: Run linting and formatting — all pass
- [x] **T-011**: Browser test: 60 paragraphs inserted → correctly split across 5 pages (14+14+14+14+4), all fit within page boundary
