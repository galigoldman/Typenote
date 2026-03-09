'use client';

import { useState } from 'react';
import { ChevronDown, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { WeekDialog } from './week-dialog';
import { deleteCourseWeek } from '@/lib/actions/course-weeks';
import { MaterialUpload } from './material-upload';
import { MaterialItem } from './material-item';
import type { CourseWeek, CourseMaterial } from '@/types/database';
import { cn } from '@/lib/utils';

interface WeekSectionProps {
  week: CourseWeek;
  courseId: string;
  userId: string;
  materials: CourseMaterial[];
  homework: CourseMaterial[];
}

export function WeekSection({
  week,
  courseId,
  userId,
  materials,
  homework,
}: WeekSectionProps) {
  const [expanded, setExpanded] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!confirm('Delete this week and all its materials?')) return;
    setDeleting(true);
    try {
      await deleteCourseWeek(week.id);
    } catch {
      setDeleting(false);
    }
  }

  return (
    <div className="rounded-lg border">
      <div className="flex items-center justify-between p-4">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 text-left"
        >
          <ChevronDown
            className={cn(
              'size-4 transition-transform',
              !expanded && '-rotate-90',
            )}
          />
          <h3 className="font-medium">
            Week {week.week_number}
            {week.topic && `: ${week.topic}`}
          </h3>
        </button>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-xs">
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setEditOpen(true)}>
                <Pencil className="size-4" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={handleDelete}
                disabled={deleting}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="size-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {expanded && (
        <div className="space-y-4 border-t px-4 py-3">
          {/* Materials section */}
          <div>
            <h4 className="mb-2 text-sm font-medium text-muted-foreground">
              Materials
            </h4>
            {materials.length > 0 && (
              <div className="mb-2 space-y-1">
                {materials.map((m) => (
                  <MaterialItem key={m.id} material={m} />
                ))}
              </div>
            )}
            <MaterialUpload
              weekId={week.id}
              courseId={courseId}
              userId={userId}
              category="material"
            />
          </div>

          {/* Homework section */}
          <div>
            <h4 className="mb-2 text-sm font-medium text-muted-foreground">
              Homework
            </h4>
            {homework.length > 0 && (
              <div className="mb-2 space-y-1">
                {homework.map((m) => (
                  <MaterialItem key={m.id} material={m} />
                ))}
              </div>
            )}
            <MaterialUpload
              weekId={week.id}
              courseId={courseId}
              userId={userId}
              category="homework"
            />
          </div>
        </div>
      )}

      <WeekDialog
        courseId={courseId}
        week={week}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
    </div>
  );
}
