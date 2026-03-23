# Data Model: PostHog Analytics Integration

**Feature**: 014-posthog-analytics
**Date**: 2026-03-23

## Overview

This feature introduces **no new database tables or migrations**. All analytics data is stored in PostHog Cloud (external service). The data model below describes the conceptual entities managed by PostHog, not Supabase.

## Entities (Managed by PostHog)

### Event

A tracked user action captured by the PostHog SDK.

| Field          | Type              | Description                                        |
| -------------- | ----------------- | -------------------------------------------------- |
| `event`        | string            | Event name (e.g., `$pageview`, `document_created`) |
| `distinct_id`  | string (UUID)     | Supabase auth user ID                              |
| `timestamp`    | ISO 8601 datetime | When the event occurred                            |
| `properties`   | JSON object       | Event-specific metadata                            |
| `$session_id`  | string            | Links event to a session recording                 |
| `$current_url` | string            | Page URL where event occurred                      |

**Autocaptured events** (built-in): `$pageview`, `$pageleave`, `$autocapture`, `$rageclick`
**Custom events** (application-defined): See Event Contract below.

### Session Recording

A visual replay linked to events and errors.

| Field         | Type          | Description                             |
| ------------- | ------------- | --------------------------------------- |
| `session_id`  | string        | Unique session identifier               |
| `distinct_id` | string (UUID) | User who performed the session          |
| `start_time`  | datetime      | Session start                           |
| `end_time`    | datetime      | Session end                             |
| `events`      | Event[]       | All events during this session          |
| `errors`      | Error[]       | Exceptions captured during this session |

### Error (Exception)

A captured JavaScript exception.

| Field            | Type   | Description                                |
| ---------------- | ------ | ------------------------------------------ |
| `exception_type` | string | Error constructor name (e.g., `TypeError`) |
| `message`        | string | Error message                              |
| `stack_trace`    | string | Deobfuscated stack trace                   |
| `$session_id`    | string | Links to the session recording             |
| `$current_url`   | string | Page where error occurred                  |
| `$browser`       | string | Browser name and version                   |

## Relationships

```
User (Supabase UUID)
  └── has many → Sessions
        ├── contains → Events (pageviews, autocapture, custom)
        └── contains → Errors (exceptions)
```

## No Database Migrations Required

PostHog Cloud stores all analytics data. The only local state is:

- Environment variables (`NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`)
- PostHog identity cookie (managed by `postHogMiddleware`)
- PostHog localStorage persistence (managed by SDK)
