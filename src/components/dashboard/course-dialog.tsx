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
import { createCourse, updateCourse } from '@/lib/actions/courses';
import type { Course } from '@/types/database';
import { cn } from '@/lib/utils';

const PRESET_COLORS = [
  '#EF4444',
  '#F97316',
  '#EAB308',
  '#22C55E',
  '#3B82F6',
  '#8B5CF6',
  '#EC4899',
  '#6B7280',
];

interface CourseDialogProps {
  folderId: string | null;
  course?: Course;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function CourseDialog({
  folderId,
  course,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: CourseDialogProps) {
  const isEditing = !!course;
  const [internalOpen, setInternalOpen] = useState(false);
  const [name, setName] = useState(course?.name ?? '');
  const [color, setColor] = useState(course?.color ?? PRESET_COLORS[4]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const onOpenChange = isControlled ? controlledOnOpenChange! : setInternalOpen;

  function handleOpenChange(value: boolean) {
    onOpenChange(value);
    if (value) {
      setName(course?.name ?? '');
      setColor(course?.color ?? PRESET_COLORS[4]);
      setError('');
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError('Course name is required');
      return;
    }

    setLoading(true);
    setError('');

    try {
      if (isEditing) {
        await updateCourse(course.id, {
          name: name.trim(),
          color,
        });
      } else {
        await createCourse({
          name: name.trim(),
          color,
          folder_id: folderId,
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
        New Course
      </Button>
    </DialogTrigger>
  ) : null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {trigger}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEditing ? 'Edit Course' : 'Create Course'}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Update the course details.'
              : 'Create a new course to organize your academic materials.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="course-name">Name</Label>
            <Input
              id="course-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Course name"
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label>Color</Label>
            <div className="flex flex-wrap gap-2">
              {PRESET_COLORS.map((presetColor) => (
                <button
                  key={presetColor}
                  type="button"
                  onClick={() => setColor(presetColor)}
                  className={cn(
                    'size-8 rounded-full transition-all',
                    color === presetColor
                      ? 'ring-2 ring-ring ring-offset-2 ring-offset-background'
                      : 'hover:scale-110',
                  )}
                  style={{ backgroundColor: presetColor }}
                  aria-label={`Select color ${presetColor}`}
                />
              ))}
            </div>
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
                  : 'Creating...'
                : isEditing
                  ? 'Save Changes'
                  : 'Create Course'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
