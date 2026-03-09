'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ChevronDown,
  MoreHorizontal,
  Pencil,
  Trash2,
  PenLine,
  BookOpen,
  StickyNote,
  FileText,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { WeekDialog } from './week-dialog';
import { deleteCourseWeek } from '@/lib/actions/course-weeks';
import { createWeekDocument } from '@/lib/actions/documents';
import { MaterialUpload } from './material-upload';
import { MaterialItem } from './material-item';
import type { CourseWeek, CourseMaterial, Document } from '@/types/database';
import { cn } from '@/lib/utils';

interface WeekSectionProps {
  week: CourseWeek;
  courseId: string;
  userId: string;
  materials: CourseMaterial[];
  homework: CourseMaterial[];
  documents: Document[];
}

export function WeekSection({
  week,
  courseId,
  userId,
  materials,
  homework,
  documents,
}: WeekSectionProps) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [creating, setCreating] = useState<string | null>(null);

  async function handleDelete() {
    if (!confirm('Delete this week and all its materials?')) return;
    setDeleting(true);
    try {
      await deleteCourseWeek(week.id);
    } catch {
      setDeleting(false);
    }
  }

  async function handleQuickCreate(purpose: 'homework' | 'summary' | 'notes') {
    setCreating(purpose);
    try {
      const doc = await createWeekDocument({
        course_id: courseId,
        week_id: week.id,
        week_number: week.week_number,
        purpose,
      });
      router.push(`/dashboard/documents/${doc.id}`);
    } catch {
      setCreating(null);
    }
  }

  // Group documents by purpose
  const homeworkDocs = documents.filter((d) => d.purpose === 'homework');
  const summaryDocs = documents.filter((d) => d.purpose === 'summary');
  const notesDocs = documents.filter((d) => d.purpose === 'notes');
  const otherDocs = documents.filter((d) => !d.purpose);

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
          {/* Quick-action buttons */}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={creating !== null}
              onClick={() => handleQuickCreate('homework')}
            >
              <PenLine className="size-4" />
              {creating === 'homework' ? 'Creating...' : 'Start Homework'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={creating !== null}
              onClick={() => handleQuickCreate('summary')}
            >
              <BookOpen className="size-4" />
              {creating === 'summary' ? 'Creating...' : 'Summarise'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={creating !== null}
              onClick={() => handleQuickCreate('notes')}
            >
              <StickyNote className="size-4" />
              {creating === 'notes' ? 'Creating...' : 'Notes'}
            </Button>
          </div>

          {/* Documents grouped by purpose */}
          {documents.length > 0 && (
            <div className="space-y-3">
              <DocumentGroup
                label="My Solutions"
                icon={<PenLine className="size-3.5" />}
                docs={homeworkDocs}
              />
              <DocumentGroup
                label="Summaries"
                icon={<BookOpen className="size-3.5" />}
                docs={summaryDocs}
              />
              <DocumentGroup
                label="Notes"
                icon={<StickyNote className="size-3.5" />}
                docs={notesDocs}
              />
              <DocumentGroup
                label="Documents"
                icon={<FileText className="size-3.5" />}
                docs={otherDocs}
              />
            </div>
          )}

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

          {/* Assignment PDFs (questions from professor) */}
          <div>
            <h4 className="mb-2 text-sm font-medium text-muted-foreground">
              Assignment
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

function DocumentGroup({
  label,
  icon,
  docs,
}: {
  label: string;
  icon: React.ReactNode;
  docs: Document[];
}) {
  const router = useRouter();
  if (docs.length === 0) return null;

  return (
    <div>
      <h4 className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        {icon}
        {label}
      </h4>
      <div className="space-y-1">
        {docs.map((doc) => (
          <button
            key={doc.id}
            onClick={() => router.push(`/dashboard/documents/${doc.id}`)}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
          >
            <FileText className="size-3.5 text-muted-foreground" />
            <span className="truncate">{doc.title}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
