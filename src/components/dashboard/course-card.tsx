'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { GraduationCap, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { CourseDialog } from '@/components/dashboard/course-dialog';
import { deleteCourse } from '@/lib/actions/courses';
import type { Course } from '@/types/database';

interface CourseCardProps {
  course: Course;
}

export function CourseCard({ course }: CourseCardProps) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteCourse(course.id);
    } catch {
      setDeleting(false);
    }
  }

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={() => router.push(`/dashboard/courses/${course.id}`)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            router.push(`/dashboard/courses/${course.id}`);
          }
        }}
        className="group flex cursor-pointer items-center gap-3 rounded-lg border p-4 transition-colors hover:bg-muted/50"
      >
        <div
          className="flex size-10 shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: `${course.color}20` }}
        >
          <GraduationCap className="size-5" style={{ color: course.color }} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{course.name}</p>
          <p className="text-sm text-muted-foreground">Course</p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              className="shrink-0 opacity-0 group-hover:opacity-100"
              onClick={(e) => e.stopPropagation()}
              aria-label="Course actions"
            >
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
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
      <CourseDialog
        folderId={course.folder_id}
        course={course}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
    </>
  );
}
