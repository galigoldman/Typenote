'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { SUBJECTS, CANVAS_TYPES } from '@/lib/constants/subjects';
import { createDocument } from '@/lib/actions/documents';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

interface CreateDocumentDialogProps {
  folderId?: string | null;
  courseId?: string | null;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

export function CreateDocumentDialog({
  folderId = null,
  courseId = null,
  children,
  defaultOpen = false,
}: CreateDocumentDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(defaultOpen);
  const [title, setTitle] = useState('Untitled');
  const [subject, setSubject] = useState('calculus');
  const [subjectCustom, setSubjectCustom] = useState('');
  const [canvasType, setCanvasType] = useState('blank');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const doc = await createDocument({
        title: title.trim() || 'Untitled',
        subject,
        subject_custom: subject === 'other' ? subjectCustom : undefined,
        canvas_type: canvasType,
        folder_id: courseId ? null : folderId,
        course_id: courseId,
      });

      setOpen(false);
      resetForm();
      router.push(`/dashboard/documents/${doc.id}`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to create document',
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  function resetForm() {
    setTitle('Untitled');
    setSubject('calculus');
    setSubjectCustom('');
    setCanvasType('blank');
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
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create New Document</DialogTitle>
            <DialogDescription>
              Set up your new document with a title, subject, and canvas type.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Untitled"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="subject">Subject</Label>
              <Select value={subject} onValueChange={setSubject}>
                <SelectTrigger id="subject">
                  <SelectValue placeholder="Select a subject" />
                </SelectTrigger>
                <SelectContent>
                  {SUBJECTS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {subject === 'other' && (
              <div className="grid gap-2">
                <Label htmlFor="subject-custom">Custom Subject</Label>
                <Input
                  id="subject-custom"
                  value={subjectCustom}
                  onChange={(e) => setSubjectCustom(e.target.value)}
                  placeholder="Enter custom subject"
                />
              </div>
            )}

            <div className="grid gap-2">
              <Label>Canvas Type</Label>
              <RadioGroup
                value={canvasType}
                onValueChange={setCanvasType}
                className="flex gap-4"
              >
                {CANVAS_TYPES.map((ct) => (
                  <div key={ct.value} className="flex items-center gap-2">
                    <RadioGroupItem
                      value={ct.value}
                      id={`canvas-${ct.value}`}
                    />
                    <Label htmlFor={`canvas-${ct.value}`}>{ct.label}</Label>
                  </div>
                ))}
              </RadioGroup>
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
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Creating...' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
