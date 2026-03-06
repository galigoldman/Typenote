'use client';

import { useRouter } from 'next/navigation';
import { MoreHorizontal, Pencil, FolderInput, Trash2 } from 'lucide-react';
import type { Document } from '@/types/database';
import { SUBJECTS } from '@/lib/constants/subjects';
import { cn } from '@/lib/utils';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardAction,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const SUBJECT_COLORS: Record<string, string> = {
  calculus: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  linear_algebra:
    'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  discrete_math:
    'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  logic:
    'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  data_structures:
    'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  algorithms: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  physics: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200',
  other: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
};

function getRelativeTime(dateString: string): string {
  const now = new Date();
  const date = new Date(dateString);
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

interface DocumentCardProps {
  document: Document;
  onRename?: (id: string) => void;
  onMove?: (id: string) => void;
  onDelete?: (id: string) => void;
}

export function DocumentCard({
  document,
  onRename,
  onMove,
  onDelete,
}: DocumentCardProps) {
  const router = useRouter();

  const subjectLabel =
    document.subject === 'other' && document.subject_custom
      ? document.subject_custom
      : (SUBJECTS.find((s) => s.value === document.subject)?.label ??
        document.subject);

  const subjectColor = SUBJECT_COLORS[document.subject] ?? SUBJECT_COLORS.other;

  return (
    <Card
      className="cursor-pointer transition-shadow hover:shadow-md"
      onClick={() => router.push(`/dashboard/documents/${document.id}`)}
      data-testid="document-card"
    >
      <CardHeader>
        <CardTitle className="truncate text-base">{document.title}</CardTitle>
        <CardAction>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={(e) => e.stopPropagation()}
                aria-label="Document options"
              >
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              onClick={(e) => e.stopPropagation()}
            >
              <DropdownMenuItem onClick={() => onRename?.(document.id)}>
                <Pencil className="mr-2 size-4" />
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onMove?.(document.id)}>
                <FolderInput className="mr-2 size-4" />
                Move
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => onDelete?.(document.id)}
              >
                <Trash2 className="mr-2 size-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </CardAction>
        <CardDescription className="flex items-center gap-2">
          <span
            className={cn(
              'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
              subjectColor,
            )}
            data-testid="subject-badge"
          >
            {subjectLabel}
          </span>
          <span className="text-xs text-muted-foreground">
            {getRelativeTime(document.updated_at)}
          </span>
        </CardDescription>
      </CardHeader>
    </Card>
  );
}
