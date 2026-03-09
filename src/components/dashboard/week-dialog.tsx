'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createCourseWeek, updateCourseWeek } from '@/lib/actions/course-weeks';
import type { CourseWeek } from '@/types/database';

interface WeekDialogProps {
  courseId: string;
  week?: CourseWeek;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function WeekDialog({
  courseId,
  week,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: WeekDialogProps) {
  const isEditing = !!week;
  const [internalOpen, setInternalOpen] = useState(false);
  const [topic, setTopic] = useState(week?.topic ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const onOpenChange = isControlled ? controlledOnOpenChange! : setInternalOpen;

  function handleOpenChange(value: boolean) {
    onOpenChange(value);
    if (value) {
      setTopic(week?.topic ?? '');
      setError('');
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    setLoading(true);
    setError('');

    try {
      if (isEditing) {
        await updateCourseWeek(week.id, {
          topic: topic.trim() || undefined,
        });
      } else {
        await createCourseWeek({
          course_id: courseId,
          topic: topic.trim() || undefined,
        });
      }
      handleOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  const trigger = !isEditing ? (
    <DialogTrigger asChild>
      <Button size="sm">
        <Plus className="size-4" />
        Add Week
      </Button>
    </DialogTrigger>
  ) : null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {trigger}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Week' : 'Add Week'}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Update the week details.'
              : 'Add a new week to this course.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="week-topic">Topic</Label>
            <Input
              id="week-topic"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g., Derivatives"
              autoFocus
            />
          </div>
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={loading}>
              {loading
                ? isEditing
                  ? 'Saving...'
                  : 'Adding...'
                : isEditing
                  ? 'Save Changes'
                  : 'Add Week'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
