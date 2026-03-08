'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Folder, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { FolderDialog } from '@/components/dashboard/folder-dialog';
import { deleteFolder } from '@/lib/actions/folders';
import type { Folder as FolderType } from '@/types/database';

interface FolderCardProps {
  folder: FolderType;
}

export function FolderCard({ folder }: FolderCardProps) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteFolder(folder.id);
    } catch {
      setDeleting(false);
    }
  }

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={() => router.push(`/dashboard/folders/${folder.id}`)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            router.push(`/dashboard/folders/${folder.id}`);
          }
        }}
        className="group flex cursor-pointer items-center gap-3 rounded-lg border p-4 transition-colors hover:bg-muted/50"
      >
        <div
          className="flex size-10 shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: `${folder.color}20` }}
        >
          <Folder className="size-5" style={{ color: folder.color }} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{folder.name}</p>
          <p className="text-sm text-muted-foreground">Folder</p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              className="shrink-0 opacity-0 group-hover:opacity-100 touch:opacity-100"
              onClick={(e) => e.stopPropagation()}
              aria-label="Folder actions"
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
      <FolderDialog
        parentId={folder.parent_id}
        folder={folder}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
    </>
  );
}
