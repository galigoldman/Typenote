'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Folder as FolderType } from '@/types/database';

interface FolderNodeProps {
  folder: FolderType;
  folders: FolderType[];
  level: number;
}

function FolderNode({ folder, folders, level }: FolderNodeProps) {
  const [expanded, setExpanded] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  const children = folders.filter((f) => f.parent_id === folder.id);
  const isActive = pathname === `/dashboard/folders/${folder.id}`;

  return (
    <div>
      <button
        onClick={() => router.push(`/dashboard/folders/${folder.id}`)}
        className={cn(
          'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent',
          isActive && 'bg-accent text-accent-foreground',
        )}
        style={{ paddingLeft: `${level * 12 + 8}px` }}
      >
        {children.length > 0 ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
            className="shrink-0"
          >
            <ChevronRight
              className={cn(
                'size-3.5 transition-transform',
                expanded && 'rotate-90',
              )}
            />
          </button>
        ) : (
          <span className="w-3.5" />
        )}
        <span
          className="size-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: folder.color }}
        />
        <span className="truncate">{folder.name}</span>
      </button>
      {expanded && children.length > 0 && (
        <div>
          {children.map((child) => (
            <FolderNode
              key={child.id}
              folder={child}
              folders={folders}
              level={level + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function SidebarFolderTree() {
  const [folders, setFolders] = useState<FolderType[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchFolders() {
      const supabase = createClient();
      const { data } = await supabase
        .from('folders')
        .select('*')
        .order('position', { ascending: true });

      if (data) {
        setFolders(data as FolderType[]);
      }
      setLoading(false);
    }

    fetchFolders();
  }, []);

  const rootFolders = folders.filter((f) => f.parent_id === null);

  if (loading) {
    return (
      <div className="space-y-2 px-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-7 animate-pulse rounded-md bg-muted" />
        ))}
      </div>
    );
  }

  if (rootFolders.length === 0) {
    return (
      <p className="px-2 py-4 text-center text-sm text-muted-foreground">
        No folders yet
      </p>
    );
  }

  return (
    <div className="space-y-0.5">
      {rootFolders.map((folder) => (
        <FolderNode
          key={folder.id}
          folder={folder}
          folders={folders}
          level={0}
        />
      ))}
    </div>
  );
}
