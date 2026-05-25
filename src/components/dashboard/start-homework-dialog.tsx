'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { BookOpen, FileText } from 'lucide-react';
import { createHomeworkSession } from '@/lib/actions/homework';
import { trackEvent } from '@/lib/analytics/events';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import type {
  Document,
  CourseMaterial,
  PersonalFile,
  CourseWeek,
  HomeworkMaterialType,
} from '@/types/database';

interface MoodleSectionForDialog {
  id: string;
  title: string;
  moodle_files: Array<{
    id: string;
    file_name: string;
    type: string;
  }>;
}

interface StartHomeworkDialogProps {
  courseId: string;
  documents: Document[];
  materials: CourseMaterial[];
  personalFiles: PersonalFile[];
  weeks: CourseWeek[];
  moodleSections: MoodleSectionForDialog[];
  children: React.ReactNode;
}

export function StartHomeworkDialog({
  courseId,
  documents,
  materials,
  personalFiles,
  weeks,
  moodleSections,
  children,
}: StartHomeworkDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // exercise key: "document:<id>" or "moodle_file:<id>" or "course_material:<id>"
  const [selectedExercise, setSelectedExercise] = useState<string | null>(null);
  const [selectedMaterials, setSelectedMaterials] = useState<Set<string>>(
    new Set(),
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Build a flat list of all selectable items for the exercise picker
  const exerciseItems: Array<{
    key: string;
    label: string;
    group: string;
  }> = [];

  // Documents
  for (const doc of documents) {
    exerciseItems.push({
      key: `document:${doc.id}`,
      label: doc.title,
      group: 'Documents',
    });
  }

  // Course materials (uploaded PDFs in weeks)
  for (const mat of materials) {
    exerciseItems.push({
      key: `course_material:${mat.id}`,
      label: mat.file_name,
      group: 'Course Materials',
    });
  }

  // Moodle files
  for (const section of moodleSections) {
    for (const file of section.moodle_files) {
      if (file.type === 'file') {
        exerciseItems.push({
          key: `moodle_file:${file.id}`,
          label: file.file_name,
          group: section.title,
        });
      }
    }
  }

  // Personal files
  for (const pf of personalFiles) {
    exerciseItems.push({
      key: `personal_file:${pf.id}`,
      label: pf.display_name,
      group: 'Your Files',
    });
  }

  const hasItems = exerciseItems.length > 0;

  // Group exercise items by group for display
  const exerciseGroups = new Map<string, typeof exerciseItems>();
  for (const item of exerciseItems) {
    const group = exerciseGroups.get(item.group) ?? [];
    group.push(item);
    exerciseGroups.set(item.group, group);
  }

  // Material items: same as exercise items but excluding the selected exercise
  const materialItems = exerciseItems.filter(
    (item) => item.key !== selectedExercise,
  );
  const materialGroups = new Map<string, typeof materialItems>();
  for (const item of materialItems) {
    const group = materialGroups.get(item.group) ?? [];
    group.push(item);
    materialGroups.set(item.group, group);
  }

  function toggleMaterial(key: string) {
    setSelectedMaterials((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function parseKey(key: string): { type: HomeworkMaterialType; id: string } {
    const [type, id] = key.split(':') as [HomeworkMaterialType, string];
    return { type, id };
  }

  async function handleSubmit() {
    if (!selectedExercise) return;
    setIsSubmitting(true);
    setError(null);

    try {
      const exerciseRef = parseKey(selectedExercise);
      const materialRefs = Array.from(selectedMaterials).map(parseKey);
      const result = await createHomeworkSession({
        courseId,
        exerciseRef,
        materialRefs,
      });

      trackEvent('document_created', {
        course_id: courseId,
        document_type: 'blank',
        purpose: 'homework',
      });
      setOpen(false);
      resetForm();
      router.push(`/dashboard/documents/${result.documentId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start homework');
    } finally {
      setIsSubmitting(false);
    }
  }

  function resetForm() {
    setSelectedExercise(null);
    setSelectedMaterials(new Set());
    setError(null);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (!value) resetForm();
      }}
    >
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Start Homework</DialogTitle>
          <DialogDescription>
            Choose the exercise you&apos;re working on and the relevant
            lectures, recitations, or materials. The AI chat will use all of
            this as context so you can ask questions like &quot;what does
            question 2 mean?&quot; and it will know exactly what you&apos;re
            referring to.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 py-4">
          {/* Step 1: Exercise picker */}
          <div className="grid gap-2">
            <Label className="flex items-center gap-1.5">
              <BookOpen className="size-4" />
              1. Select the Exercise
            </Label>
            <p className="-mt-1 text-xs text-muted-foreground">
              Pick the homework or problem set you want to work on.
            </p>
            {hasItems ? (
              <div className="max-h-48 space-y-2 overflow-y-auto rounded-md border p-2">
                {Array.from(exerciseGroups.entries()).map(([group, items]) => (
                  <div key={group}>
                    <p className="mb-1 text-xs font-medium text-muted-foreground">
                      {group}
                    </p>
                    {items.map((item) => (
                      <label
                        key={item.key}
                        className={`flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm transition-colors ${
                          selectedExercise === item.key
                            ? 'bg-primary/10 text-primary'
                            : 'hover:bg-accent'
                        }`}
                      >
                        <input
                          type="radio"
                          name="exercise"
                          value={item.key}
                          checked={selectedExercise === item.key}
                          onChange={() => setSelectedExercise(item.key)}
                          className="accent-primary"
                        />
                        <span className="truncate">{item.label}</span>
                      </label>
                    ))}
                  </div>
                ))}
              </div>
            ) : (
              <p className="rounded-md border border-dashed p-3 text-center text-sm text-muted-foreground">
                No documents or materials found in this course.
              </p>
            )}
          </div>

          {/* Step 2: Materials picker */}
          <div className="grid gap-2">
            <Label className="flex items-center gap-1.5">
              <FileText className="size-4" />
              2. Select Relevant Materials
              <span className="text-xs font-normal text-muted-foreground">
                (you can select multiple)
              </span>
            </Label>
            <p className="-mt-1 text-xs text-muted-foreground">
              Choose the lectures, recitations, notes, or any material that this
              homework is based on. The AI will read their content to help
              explain the questions.
            </p>
            {materialItems.length > 0 ? (
              <div className="max-h-48 space-y-2 overflow-y-auto rounded-md border p-2">
                {Array.from(materialGroups.entries()).map(([group, items]) => (
                  <div key={group}>
                    <p className="mb-1 text-xs font-medium text-muted-foreground">
                      {group}
                    </p>
                    {items.map((item) => (
                      <label
                        key={item.key}
                        className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-accent"
                      >
                        <input
                          type="checkbox"
                          checked={selectedMaterials.has(item.key)}
                          onChange={() => toggleMaterial(item.key)}
                          className="accent-primary"
                        />
                        <span className="truncate">{item.label}</span>
                      </label>
                    ))}
                  </div>
                ))}
              </div>
            ) : (
              <p className="rounded-md border border-dashed p-3 text-center text-sm text-muted-foreground">
                Select an exercise first to see available materials.
              </p>
            )}
            {selectedMaterials.size > 0 && (
              <p className="text-xs text-primary">
                {selectedMaterials.size} material
                {selectedMaterials.size > 1 ? 's' : ''} selected
              </p>
            )}
          </div>

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!selectedExercise || isSubmitting}
            onClick={handleSubmit}
          >
            {isSubmitting ? 'Starting...' : 'Start'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
