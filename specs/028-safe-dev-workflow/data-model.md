# Data Model: Safe Development Workflow

This feature does not introduce new database tables or modify the schema. It is an infrastructure/workflow change only.

## Existing Entities Used

### Test User (in `supabase/seed.sql`)
- **Email**: `test@typenote.dev`
- **Password**: `Test1234`
- **UUID**: `ac3be77d-4566-406c-9ac0-7c410634ad41`
- **Status**: Email confirmed, free tier
- **Associated data**: 4 folders, 6 documents, 2 courses, AI conversations, personal files

This seeded user is the identity E2E tests use to log in and interact with the app. No changes needed to the seed data for the initial infrastructure setup. Additional seed data for specific features will be added during Phase 2 (writing E2E tests).
