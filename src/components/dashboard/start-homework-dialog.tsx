'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { BookOpen, FileText } from 'lucide-react';
import { createHomeworkSession } from '@/lib/actions/homework';
import {
  getMoodleMaterialsForCourse,
  type MoodleSectionDto,
} from '@/lib/actions/moodle-materials';
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
import type { HomeworkMaterialType } from '@/types/database';

// Minimal projections — the dialog only displays names. Passing full rows
// (documents carry heavy content/pages JSONB) bloats the client-component
// RSC payload and, on client-side navigation, drops the DialogTrigger child.
interface StartHomeworkDialogProps {
  courseId: string;
  documents: Array<{ id: string; title: string }>;
  materials: Array<{ id: string; label: string | null; file_name: string }>;
  personalFiles: Array<{ id: string; display_name: string }>;
  children: React.ReactNode;
}

export function StartHomeworkDialog({
  courseId,
  documents,
  materials,
  personalFiles,
  children,
}: StartHomeworkDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selectedExercise, setSelectedExercise] = useState<string | null>(null);
  const [selectedMaterials, setSelectedMaterials] = useState<Set<string>>(
    new Set(),
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [moodleSections, setMoodleSections] = useState<MoodleSectionDto[]>([]);
  const [moodleLoaded, setMoodleLoaded] = useState(false);

  useEffect(() => {
    if (!open || moodleLoaded) return;
    setMoodleLoaded(true);
    getMoodleMaterialsForCourse(courseId)
      .then(setMoodleSections)
      .catch(() => setMoodleSections([]));
  }, [open, moodleLoaded, courseId]);

  function toggleMaterial(key: string) {
    setSelectedMaterials((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function parseMaterialKey(key: string): {
    type: HomeworkMaterialType;
    id: string;
  } {
    const [type, id] = key.split(':') as [HomeworkMaterialType, string];
    return { type, id };
  }

  async function handleSubmit() {
    if (!selectedExercise) return;
    setIsSubmitting(true);
    setError(null);

    try {
      const materialRefs = Array.from(selectedMaterials).map(parseMaterialKey);
      const result = await createHomeworkSession({
        courseId,
        exercise: parseMaterialKey(selectedExercise),
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

  // All pickable sources, grouped for display. Step 1 (the exercise, single
  // select) and Step 2 (pinned materials, multi-select) draw from the same
  // list; keys are `${type}:${id}` and parsed by parseMaterialKey. Moodle
  // files appear once they finish lazy-loading.
  const sourceGroups = [
    {
      label: 'Documents',
      items: documents.map((d) => ({ key: `document:${d.id}`, name: d.title })),
    },
    {
      label: 'Course Materials',
      items: materials.map((m) => ({
        key: `course_material:${m.id}`,
        name: m.label ?? m.file_name,
      })),
    },
    {
      label: 'Your Files',
      items: personalFiles.map((f) => ({
        key: `personal_file:${f.id}`,
        name: f.display_name,
      })),
    },
    {
      label: 'Moodle Files',
      items: moodleSections.flatMap((s) =>
        s.files.map((f) => ({ key: `moodle_file:${f.id}`, name: f.file_name })),
      ),
    },
  ].filter((g) => g.items.length > 0);

  const hasSources = sourceGroups.length > 0;

  // Step 2 lists every source except whichever one is chosen as the exercise.
  const pinnableGroups = sourceGroups
    .map((g) => ({
      ...g,
      items: g.items.filter((i) => i.key !== selectedExercise),
    }))
    .filter((g) => g.items.length > 0);

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
            <p className="text-xs text-muted-foreground -mt-1">
              Pick the homework or problem set you want to work on.
            </p>
            {hasSources ? (
              <div className="max-h-44 space-y-2 overflow-y-auto rounded-md border p-2">
                {sourceGroups.map((group) => (
                  <div key={group.label}>
                    <p className="mb-1 text-xs font-medium text-muted-foreground">
                      {group.label}
                    </p>
                    {group.items.map((item) => (
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
                        <span className="truncate">{item.name}</span>
                      </label>
                    ))}
                  </div>
                ))}
              </div>
            ) : (
              <p className="rounded-md border border-dashed p-3 text-center text-sm text-muted-foreground">
                Import a file or create a document first to use as the exercise.
              </p>
            )}
          </div>

          {/* Step 2: Materials picker — always visible */}
          <div className="grid gap-2">
            <Label className="flex items-center gap-1.5">
              <FileText className="size-4" />
              2. Select Relevant Materials
              <span className="text-xs font-normal text-muted-foreground">
                (you can select multiple)
              </span>
            </Label>
            <p className="text-xs text-muted-foreground -mt-1">
              Choose the lectures, recitations, notes, or any document that this
              homework is based on. The AI will read their content to help
              explain the questions.
            </p>
            <p className="text-xs text-muted-foreground">
              The AI always sees all your course materials — pinning just tells
              it what to focus on first.
            </p>
            <div className="max-h-48 space-y-2 overflow-y-auto rounded-md border p-2">
              {pinnableGroups.map((group) => (
                <div key={group.label}>
                  <p className="mb-1 text-xs font-medium text-muted-foreground">
                    {group.label}
                  </p>
                  {group.items.map((item) => (
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
                      <span className="truncate">{item.name}</span>
                    </label>
                  ))}
                </div>
              ))}
              {pinnableGroups.length === 0 && (
                <p className="px-2 py-1 text-xs text-muted-foreground">
                  No other materials to pin.
                </p>
              )}
            </div>
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
