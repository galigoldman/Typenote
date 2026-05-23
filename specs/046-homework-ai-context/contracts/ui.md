# UI Contracts: Homework AI Context

## New Components

### `StartHomeworkDialog`

**Location**: `src/components/dashboard/start-homework-dialog.tsx`

**Props**:
```ts
{
  courseId: string;
  documents: Document[];           // all documents in the course (exercise candidates)
  materials: CourseMaterial[];     // course materials by week
  personalFiles: PersonalFile[];   // user-uploaded files
  weeks: CourseWeek[];             // for grouping materials by week
  children: React.ReactNode;       // trigger button (via DialogTrigger)
}
```

**Behavior**:
1. Opens a dialog with two sections:
   - **Select Exercise**: Radio-button list of course documents (single-select, required)
   - **Select Reference Materials**: Checkbox list of materials grouped by week (multi-select, optional)
2. "Start" button is disabled until an exercise is selected
3. On confirm: calls `createHomeworkSession` server action, then navigates to the new document

---

### `HomeworkContextBadges`

**Location**: `src/components/ai/homework-context-badges.tsx`

**Props**:
```ts
{
  context: HomeworkContext;
}
```

**Behavior**:
- Renders a collapsible section showing the exercise document name and material names as badges
- Collapsed by default, shows "Homework context: {exercise name} + {N} materials"
- Expanded shows the full list

---

## Modified Components

### `AiChatPanel` — New Optional Prop

```ts
{
  // ... existing props ...
  homeworkSessionId?: string;
  homeworkContext?: HomeworkContext;  // for display only
}
```

- If `homeworkSessionId` is provided, includes it in the `/api/ai/ask` request body
- If `homeworkContext` is provided, renders `<HomeworkContextBadges>` above the message list

### `AiChatWrapper` — New Optional Props

```ts
{
  // ... existing props ...
  homeworkSessionId?: string;
  homeworkContext?: HomeworkContext;
}
```

Passes through to `<AiChatPanel>`.

### `DocumentWithAi` — New Optional Props

```ts
{
  // ... existing props ...
  homeworkSessionId?: string;
  homeworkContext?: HomeworkContext;
}
```

Passes through to `<AiChatWrapper>`.

### Course Page — Button Addition

The course page (`src/app/(dashboard)/dashboard/courses/[courseId]/page.tsx`) adds a "Start Homework" button in the button row next to "New Document":

```tsx
<StartHomeworkDialog
  courseId={courseId}
  documents={typedDocuments}
  materials={allMaterials}
  personalFiles={[...allWeekPersonalFiles, ...coursePersonalFiles]}
  weeks={typedWeeks}
>
  <Button variant="outline" size="sm">Start Homework</Button>
</StartHomeworkDialog>
```

### Document Page — Homework Detection

The document page (`src/app/(dashboard)/dashboard/documents/[docId]/page.tsx`) fetches the homework session server-side and passes it down:

```ts
// After fetching the document:
const homeworkContext = await getHomeworkContext({ documentId: docId });
// Pass to DocumentWithAi:
<DocumentWithAi
  // ... existing props ...
  homeworkSessionId={homeworkContext?.session.id}
  homeworkContext={homeworkContext}
/>
```
