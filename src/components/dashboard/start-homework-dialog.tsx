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
  HomeworkMaterialType,
} from '@/types/database';

interface StartHomeworkDialogProps {
  courseId: string;
  documents: Document[];
  materials: CourseMaterial[];
  personalFiles: PersonalFile[];
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

  const hasDocuments = documents.length > 0;

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
        exerciseDocumentId: selectedExercise,
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
            <p className="text-xs text-muted-foreground -mt-1">
              Pick the homework or problem set you want to work on.
            </p>
            {hasDocuments ? (
              <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border p-2">
                {documents.map((doc) => (
                  <label
                    key={doc.id}
                    className={`flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm transition-colors ${
                      selectedExercise === doc.id
                        ? 'bg-primary/10 text-primary'
                        : 'hover:bg-accent'
                    }`}
                  >
                    <input
                      type="radio"
                      name="exercise"
                      value={doc.id}
                      checked={selectedExercise === doc.id}
                      onChange={() => setSelectedExercise(doc.id)}
                      className="accent-primary"
                    />
                    <span className="truncate">{doc.title}</span>
                  </label>
                ))}
              </div>
            ) : (
              <p className="rounded-md border border-dashed p-3 text-center text-sm text-muted-foreground">
                Create a document first to use as the exercise.
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
              {/* Documents (excluding the selected exercise) */}
              {documents.filter((d) => d.id !== selectedExercise).length >
                0 && (
                <div>
                  <p className="mb-1 text-xs font-medium text-muted-foreground">
                    Documents
                  </p>
                  {documents
                    .filter((d) => d.id !== selectedExercise)
                    .map((doc) => {
                      const key = `document:${doc.id}`;
                      return (
                        <label
                          key={key}
                          className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-accent"
                        >
                          <input
                            type="checkbox"
                            checked={selectedMaterials.has(key)}
                            onChange={() => toggleMaterial(key)}
                            className="accent-primary"
                          />
                          <span className="truncate">{doc.title}</span>
                        </label>
                      );
                    })}
                </div>
              )}

              {/* Course materials — flat list */}
              {materials.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-medium text-muted-foreground">
                    Course Materials
                  </p>
                  {materials.map((mat) => {
                    const key = `course_material:${mat.id}`;
                    return (
                      <label
                        key={key}
                        className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-accent"
                      >
                        <input
                          type="checkbox"
                          checked={selectedMaterials.has(key)}
                          onChange={() => toggleMaterial(key)}
                          className="accent-primary"
                        />
                        <span className="truncate">
                          {mat.label ?? mat.file_name}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}

              {/* Personal files */}
              {personalFiles.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-medium text-muted-foreground">
                    Your Files
                  </p>
                  {personalFiles.map((pf) => {
                    const key = `personal_file:${pf.id}`;
                    return (
                      <label
                        key={key}
                        className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-accent"
                      >
                        <input
                          type="checkbox"
                          checked={selectedMaterials.has(key)}
                          onChange={() => toggleMaterial(key)}
                          className="accent-primary"
                        />
                        <span className="truncate">{pf.display_name}</span>
                      </label>
                    );
                  })}
                </div>
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
