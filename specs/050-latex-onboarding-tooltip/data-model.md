# Data Model: LaTeX Onboarding Tooltip

**Feature**: 050-latex-onboarding-tooltip
**Date**: 2026-06-04

## Overview

No database changes required. This feature uses browser localStorage only.

## Client-Side State

### localStorage Entry

| Key | Type | Default | Description |
| --- | ---- | ------- | ----------- |
| `typenote:latex-onboarding-dismissed` | `"true"` or absent | absent | Set to `"true"` when user clicks "Got it". Absence means the onboarding has not been dismissed. |

### Component State

| State | Type | Owner | Description |
| ----- | ---- | ----- | ----------- |
| `isDismissed` | `boolean` | `useLocalDismissal` hook | Whether the user has previously dismissed the onboarding. Read from localStorage on mount. |
| `isOpen` | `boolean` | `LaTeXOnboarding` component | Whether the popover is currently visible (either auto-shown or manually opened). |
| `isFirstTime` | `boolean` | Derived (`!isDismissed`) | Controls whether the "Got it" button is shown. |

## State Transitions

```text
Page Load
  ├── localStorage has key → isDismissed=true, isOpen=false
  │     └── User clicks icon → isOpen=true (no "Got it" button)
  │           └── User clicks outside / icon again → isOpen=false
  │
  └── localStorage missing key → isDismissed=false, isOpen=true (auto-show)
        └── User clicks "Got it" → isDismissed=true, isOpen=false
              └── localStorage key written
```
