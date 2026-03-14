'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { ChevronRight, GraduationCap } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Course, Folder as FolderType } from '@/types/database';

interface FolderNodeProps {
  folder: FolderType;
  folders: FolderType[];
  courses: Course[];
  level: number;
}

function FolderNode({ folder, folders, courses, level }: FolderNodeProps) {
  const [expanded, setExpanded] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  const children = folders.filter((f) => f.parent_id === folder.id);
  const folderCourses = courses.filter((c) => c.folder_id === folder.id);
  const hasChildren = children.length > 0 || folderCourses.length > 0;
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
        {hasChildren ? (
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
      {expanded && (children.length > 0 || folderCourses.length > 0) && (
        <div>
          {children.map((child) => (
            <FolderNode
              key={child.id}
              folder={child}
              folders={folders}
              courses={courses}
              level={level + 1}
            />
          ))}
          {folderCourses.map((course) => (
            <CourseNode key={course.id} course={course} level={level + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

interface CourseNodeProps {
  course: Course;
  level: number;
}

function CourseNode({ course, level }: CourseNodeProps) {
  const router = useRouter();
  const pathname = usePathname();
  const isActive = pathname === `/dashboard/courses/${course.id}`;

  return (
    <button
      onClick={() => router.push(`/dashboard/courses/${course.id}`)}
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent',
        isActive && 'bg-accent text-accent-foreground',
      )}
      style={{ paddingLeft: `${level * 12 + 8}px` }}
    >
      <span className="w-3.5" />
      <GraduationCap
        className="size-3.5 shrink-0"
        style={{ color: course.color }}
      />
      <span className="truncate">{course.name}</span>
    </button>
  );
}

export function SidebarFolderTree() {
  const [folders, setFolders] = useState<FolderType[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const pathname = usePathname();

  useEffect(() => {
    async function fetchData() {
      const supabase = createClient();
      const { data } = await supabase
        .from('folders')
        .select('*')
        .order('position', { ascending: true });

      if (data) {
        setFolders(data as FolderType[]);
      }

      const { data: courseData } = await supabase
        .from('courses')
        .select('*')
        .order('position', { ascending: true });

      if (courseData) {
        setCourses(courseData as Course[]);
      }
      setLoading(false);
    }

    fetchData();
  }, [pathname]);

  const rootFolders = folders.filter((f) => f.parent_id === null);
  const rootCourses = courses.filter((c) => c.folder_id === null);

  if (loading) {
    return (
      <div className="space-y-2 px-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-7 animate-pulse rounded-md bg-muted" />
        ))}
      </div>
    );
  }

  if (rootFolders.length === 0 && rootCourses.length === 0) {
    return (
      <p className="px-2 py-4 text-center text-sm text-muted-foreground">
        No courses or folders yet
      </p>
    );
  }

  return (
    <div className="space-y-0.5">
      {rootCourses.map((course) => (
        <CourseNode key={course.id} course={course} level={0} />
      ))}
      {rootFolders.map((folder) => (
        <FolderNode
          key={folder.id}
          folder={folder}
          folders={folders}
          courses={courses}
          level={0}
        />
      ))}
    </div>
  );
}
