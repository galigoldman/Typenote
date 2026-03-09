# Developer Quickstart: Course Structure & Material Upload

**Feature**: 003-course-materials
**Date**: 2026-03-08

## Prerequisites

- Node.js 18+
- pnpm
- Supabase CLI (for running migrations locally)
- Feature branch `003-course-materials` checked out

## Setup

```bash
git checkout 003-course-materials
pnpm install
supabase db reset    # Apply migrations + seed data
```

## Development

```bash
pnpm dev             # Start Next.js dev server
```

## Key Files — New

| File                                                        | Purpose                                             |
| ----------------------------------------------------------- | --------------------------------------------------- |
| `supabase/migrations/00003_create_courses.sql`              | New tables: courses, course_weeks, course_materials |
| `supabase/migrations/00004_add_document_course_id.sql`      | Add course_id column to documents table             |
| `supabase/migrations/00005_create_storage_bucket.sql`       | Storage bucket + RLS policies for course materials  |
| `src/types/database.ts`                                     | New interfaces: Course, CourseWeek, CourseMaterial  |
| `src/lib/actions/courses.ts`                                | Server actions: CRUD for courses                    |
| `src/lib/actions/course-weeks.ts`                           | Server actions: CRUD for weeks                      |
| `src/lib/actions/course-materials.ts`                       | Server actions: CRUD for materials + storage        |
| `src/lib/queries/courses.ts`                                | Query functions for courses                         |
| `src/lib/queries/course-weeks.ts`                           | Query functions for weeks                           |
| `src/lib/queries/course-materials.ts`                       | Query functions for materials                       |
| `src/components/dashboard/course-card.tsx`                  | Course card for dashboard grid                      |
| `src/components/dashboard/course-dialog.tsx`                | Create/edit course dialog                           |
| `src/components/dashboard/week-section.tsx`                 | Week display with materials/homework sections       |
| `src/components/dashboard/material-upload.tsx`              | Drag-and-drop PDF upload component                  |
| `src/components/dashboard/material-item.tsx`                | Material list item with view/delete actions         |
| `src/app/(dashboard)/dashboard/courses/[courseId]/page.tsx` | Course view page                                    |

## Key Files — Modified

| File                                                  | Change                                           |
| ----------------------------------------------------- | ------------------------------------------------ |
| `src/app/(dashboard)/dashboard/page.tsx`              | Add courses query + course cards to grid         |
| `src/components/dashboard/sidebar-folder-tree.tsx`    | Add course nodes to sidebar tree                 |
| `src/components/dashboard/create-document-dialog.tsx` | Support course_id when creating from course view |

## Testing

```bash
pnpm test             # Run all unit tests
pnpm test:e2e         # Run Playwright e2e tests
```

### Manual Test Checklist

1. **Create course**: Dashboard → New Course → fill name/code → verify card appears
2. **Course in folder**: Navigate to folder → New Course → verify course inside folder
3. **Add weeks**: Open course → Add Week → verify week section appears with auto-number
4. **Upload material**: In a week → Add Material → select PDF → verify upload + listing
5. **Upload homework**: In a week → Add Homework → select PDF → verify separate section
6. **View PDF**: Click uploaded material → verify PDF opens (new tab)
7. **Delete material**: Delete a material → verify file removed from listing
8. **Create document in course**: Course view → New Document → verify document has course badge
9. **Delete week**: Delete a week → verify materials removed too
10. **Delete course**: Delete course → verify all weeks, materials, documents removed
11. **File validation**: Try uploading non-PDF → verify rejection message
12. **Size validation**: Try uploading >50MB → verify rejection message
13. **Drag and drop**: Drag PDF onto materials area → verify upload works
14. **Sidebar**: Verify courses appear in sidebar with distinct icon
15. **Empty state**: New user → verify "Create your first course" prompt

## Architecture Notes

- **3 new database tables** + 1 modified table (documents)
- **1 new storage bucket** (course-materials) with RLS
- **Client-side upload** directly to Supabase Storage (no server proxy)
- **Server actions** for metadata CRUD (follows existing folder/document patterns)
- **Cascade deletes** handle cleanup, with explicit storage file removal in actions
