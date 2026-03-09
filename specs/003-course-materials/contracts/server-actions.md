# Server Action Contracts: Course Structure & Material Upload

**Feature**: 003-course-materials
**Date**: 2026-03-08

## Course Actions (`src/lib/actions/courses.ts`)

### createCourse

```typescript
createCourse(data: {
  name: string;
  code?: string;
  semester?: string;
  color: string;
  folder_id: string | null;
}) → Promise<Course>
```

- Auth required
- Inserts course with `user_id` from session
- Revalidates `/dashboard`
- Returns created course

### updateCourse

```typescript
updateCourse(id: string, data: {
  name?: string;
  code?: string;
  semester?: string;
  color?: string;
  folder_id?: string | null;
}) → Promise<Course>
```

- Auth required
- Updates only provided fields
- Revalidates `/dashboard`
- Returns updated course

### deleteCourse

```typescript
deleteCourse(id: string) → Promise<void>
```

- Auth required
- **Before database delete**: removes all files from storage bucket under `{user_id}/{course_id}/` prefix
- Database cascade handles weeks, materials records, and documents
- Revalidates `/dashboard`

### moveCourse

```typescript
moveCourse(id: string, folder_id: string | null) → Promise<void>
```

- Auth required
- Updates `folder_id` (move into folder or to root)
- Revalidates `/dashboard`

---

## Week Actions (`src/lib/actions/course-weeks.ts`)

### createCourseWeek

```typescript
createCourseWeek(data: {
  course_id: string;
  topic?: string;
  start_date?: string;
  end_date?: string;
}) → Promise<CourseWeek>
```

- Auth required
- Auto-calculates `week_number` as max existing + 1
- Revalidates `/dashboard`
- Returns created week

### updateCourseWeek

```typescript
updateCourseWeek(id: string, data: {
  topic?: string;
  start_date?: string | null;
  end_date?: string | null;
  week_number?: number;
}) → Promise<CourseWeek>
```

- Auth required
- Revalidates `/dashboard`
- Returns updated week

### deleteCourseWeek

```typescript
deleteCourseWeek(id: string) → Promise<void>
```

- Auth required
- **Before database delete**: removes all files from storage for this week's materials
- Database cascade handles material records
- Revalidates `/dashboard`

---

## Material Actions (`src/lib/actions/course-materials.ts`)

### createCourseMaterial

```typescript
createCourseMaterial(data: {
  week_id: string;
  category: 'material' | 'homework';
  storage_path: string;
  file_name: string;
  label?: string;
  file_size: number;
  mime_type: string;
}) → Promise<CourseMaterial>
```

- Auth required
- Called **after** successful file upload to storage
- Creates database record linking to the stored file
- Revalidates `/dashboard`
- Returns created material record

### updateCourseMaterial

```typescript
updateCourseMaterial(id: string, data: {
  label?: string;
}) → Promise<CourseMaterial>
```

- Auth required
- Only label is editable (file itself is immutable)
- Revalidates `/dashboard`

### deleteCourseMaterial

```typescript
deleteCourseMaterial(id: string) → Promise<void>
```

- Auth required
- Fetches material record to get `storage_path`
- Removes file from Supabase Storage
- Deletes database record
- Revalidates `/dashboard`

---

## Query Functions

### `src/lib/queries/courses.ts`

```typescript
getCoursesByFolder(folderId: string | null) → Promise<Course[]>
// Returns courses in a specific folder (or root if null)
// Ordered by position

getCourse(id: string) → Promise<Course | null>
// Returns single course by ID

getCourseBreadcrumbs(courseId: string) → Promise<{ id: string; name: string }[]>
// Returns course + parent folder chain for breadcrumb navigation
```

### `src/lib/queries/course-weeks.ts`

```typescript
getWeeksByCourse(courseId: string) → Promise<CourseWeek[]>
// Returns all weeks for a course, ordered by week_number

getWeek(id: string) → Promise<CourseWeek | null>
// Returns single week by ID
```

### `src/lib/queries/course-materials.ts`

```typescript
getMaterialsByWeek(weekId: string) → Promise<CourseMaterial[]>
// Returns all materials for a week, ordered by created_at

getMaterialsByWeekAndCategory(weekId: string, category: 'material' | 'homework') → Promise<CourseMaterial[]>
// Returns materials of a specific category for a week
```

### `src/lib/queries/documents.ts` (modified)

```typescript
getDocumentsByCourse(courseId: string) → Promise<Document[]>
// NEW: Returns documents associated with a course
// Ordered by position
```
