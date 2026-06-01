'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CANVAS_TYPES } from '@/lib/constants/subjects';
import { createDocument } from '@/lib/actions/documents';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageTypeThumb } from '@/components/ui/page-type-thumb';

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
        // Subject is no longer chosen at creation time; the column defaults to
        // 'other' (see documents.subject in 00001_initial_schema.sql).
        subject: 'other',
        canvas_type: canvasType,
        folder_id: courseId ? null : folderId,
        course_id: courseId,
      });

      trackEvent('document_created', {
        course_id: courseId,
        document_type: canvasType,
        purpose: null,
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
              Set up your new document with a title and canvas type.
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
              <Label>Page Style</Label>
              <div className="flex gap-3">
                {CANVAS_TYPES.map((ct) => (
                  <button
                    key={ct.value}
                    type="button"
                    onClick={() => setCanvasType(ct.value)}
                    className={`flex flex-col items-center gap-1.5 p-2 rounded-lg border-2 transition-colors ${
                      canvasType === ct.value
                        ? 'border-primary bg-primary/5'
                        : 'border-transparent hover:bg-accent'
                    }`}
                  >
                    <PageTypeThumb type={ct.value} size={52} />
                    <span className="text-xs font-medium">{ct.label}</span>
                  </button>
                ))}
              </div>
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
