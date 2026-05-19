# Tasks: Fix Image Resize and Position Not Persisting

**Branch**: `043-fix-image-resize-persist`
**Created**: 2026-05-18

## Phase 1: Tests (TDD - write failing tests first)

### T1: Unit test for flush-on-unmount behavior [X]

- **File**: `src/hooks/use-auto-save.test.ts` (extended)
- **Description**: Write a test that triggers a save, unmounts the hook before the debounce fires, and asserts the save function was called.
- **Acceptance**: Test fails initially (proving the bug exists), passes after the fix.

### T2: Core fix - flush pending save on unmount [X]

- **File**: `src/hooks/use-auto-save.ts`
- **Description**: Modify the cleanup effect to call `saveFnRef.current()` (fire-and-forget) when there's a pending debounce timeout, instead of just clearing the timer.
- **Acceptance**: T1 test passes. Image resize/move data persists across navigation.

## Phase 2: E2E Tests

### T3: E2E test for save-on-navigate [X]

- **File**: `e2e/save-on-navigate.spec.ts` (new)
- **Description**: Playwright test: log in, draw stroke, navigate to dashboard immediately, return, verify stroke persisted (same save pipeline as images).
- **Acceptance**: Test passes end-to-end.

## Phase 3: Verification

### T4: Run full test suite [X]

- **Description**: Run `pnpm test` to verify no regressions. All 800 tests pass across 83 files.
- **Acceptance**: All tests pass.

### T5: Update E2E test registry [X]

- **File**: `e2e/TEST_REGISTRY.md`
- **Description**: Added "Save on Navigate" section with test scenarios.
- **Acceptance**: Registry is up to date.
