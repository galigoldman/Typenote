'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  ChevronRight,
  ChevronDown,
  FolderOpen,
  BookOpen,
  AlertTriangle,
  Plus,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { createClient } from '@/lib/supabase/client';
import { moveDocument } from '@/lib/actions/documents';
import type { MoveDestination } from '@/lib/actions/documents';
import { createFolder } from '@/lib/actions/folders';
import type { Document, Course, CourseWeek, Folder } from '@/types/database';
import { cn } from '@/lib/utils';
import { trackEvent } from '@/lib/analytics/events';

interface MoveDocumentDialogProps {
  document: Document | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface CourseWithWeeks extends Course {
  weeks: CourseWeek[];
}

export function MoveDocumentDialog({
  document,
  open,
  onOpenChange,
}: MoveDocumentDialogProps) {
  const supabaseRef = useRef(createClient());

  const [courses, setCourses] = useState<CourseWithWeeks[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(false);
  const [moving, setMoving] = useState(false);
  const [error, setError] = useState('');

  // Tree expand state — set of course IDs that are expanded
  const [expandedCourses, setExpandedCourses] = useState<Set<string>>(
    new Set(),
  );

  // Selection state
  const [destination, setDestination] = useState<MoveDestination | null>(null);

  // Inline new folder creation
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [creatingFolder, setCreatingFolder] = useState(false);

  // Determine the document's current location as a MoveDestination
  function getCurrentLocation(): MoveDestination | null {
    if (!document) return null;
    if (document.folder_id) {
      return { type: 'folder', folderId: document.folder_id };
    }
    if (document.course_id) {
      return {
        type: 'course',
        courseId: document.course_id,
        weekId: document.week_id ?? undefined,
      };
    }
    return { type: 'root' };
  }

  // Check if two destinations match
  function destinationsMatch(
    a: MoveDestination | null,
    b: MoveDestination | null,
  ): boolean {
    if (!a || !b) return false;
    if (a.type !== b.type) return false;
    if (a.type === 'root' && b.type === 'root') return true;
    if (a.type === 'folder' && b.type === 'folder') {
      return a.folderId === b.folderId;
    }
    if (a.type === 'course' && b.type === 'course') {
      return a.courseId === b.courseId && a.weekId === b.weekId;
    }
    return false;
  }

  const currentLocation = getCurrentLocation();

  // Check if the destination changes the course (for material link warning)
  const showMaterialWarning =
    document?.material_id != null &&
    destination != null &&
    !destinationsMatch(destination, currentLocation) &&
    (destination.type !== 'course' ||
      destination.courseId !== document.course_id);

  // Fetch courses and folders when dialog opens
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    const supabase = supabaseRef.current;

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setError('Not authenticated');
        return;
      }

      const [coursesRes, weeksRes, foldersRes] = await Promise.all([
        supabase
          .from('courses')
          .select('*')
          .eq('user_id', user.id)
          .order('position'),
        supabase
          .from('course_weeks')
          .select('*')
          .eq('user_id', user.id)
          .order('week_number'),
        supabase
          .from('folders')
          .select('*')
          .eq('user_id', user.id)
          .is('parent_id', null)
          .order('position'),
      ]);

      if (coursesRes.error) throw new Error(coursesRes.error.message);
      if (weeksRes.error) throw new Error(weeksRes.error.message);
      if (foldersRes.error) throw new Error(foldersRes.error.message);

      // Group weeks by course
      const weeksByCourse = new Map<string, CourseWeek[]>();
      for (const week of weeksRes.data) {
        const existing = weeksByCourse.get(week.course_id) ?? [];
        existing.push(week);
        weeksByCourse.set(week.course_id, existing);
      }

      const coursesWithWeeks: CourseWithWeeks[] = coursesRes.data.map(
        (course) => ({
          ...course,
          weeks: weeksByCourse.get(course.id) ?? [],
        }),
      );

      setCourses(coursesWithWeeks);
      setFolders(foldersRes.data);

      // Auto-expand the course that contains the current document
      if (document?.course_id) {
        setExpandedCourses(new Set([document.course_id]));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [document?.course_id]);

  useEffect(() => {
    if (open && document) {
      setDestination(null);
      setShowNewFolder(false);
      setNewFolderName('');
      setError('');
      setMoving(false);
      fetchData();
    }
  }, [open, document, fetchData]);

  function toggleCourseExpand(courseId: string) {
    setExpandedCourses((prev) => {
      const next = new Set(prev);
      if (next.has(courseId)) {
        next.delete(courseId);
      } else {
        next.add(courseId);
      }
      return next;
    });
  }

  async function handleCreateFolder() {
    const trimmed = newFolderName.trim();
    if (!trimmed) return;

    setCreatingFolder(true);
    try {
      await createFolder({
        name: trimmed,
        color: '#3B82F6',
        parent_id: null,
      });
      setNewFolderName('');
      setShowNewFolder(false);
      // Re-fetch to get the new folder
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create folder');
    } finally {
      setCreatingFolder(false);
    }
  }

  async function handleMove() {
    if (!document || !destination) return;

    // Don't move if destination is the same as current location
    if (destinationsMatch(destination, currentLocation)) {
      onOpenChange(false);
      return;
    }

    setMoving(true);
    setError('');

    try {
      await moveDocument(document.id, destination);
      trackEvent('document_moved', {
        destination_type: destination.type,
      });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to move document');
    } finally {
      setMoving(false);
    }
  }

  const isCurrentLocation = destinationsMatch(destination, currentLocation);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Move Document</DialogTitle>
          <DialogDescription>
            Choose a new location for &ldquo;{document?.title}&rdquo;
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">
              Loading...
            </span>
          </div>
        ) : (
          <div className="max-h-[50vh] space-y-4 overflow-y-auto pr-1">
            {/* Courses section */}
            {courses.length > 0 && (
              <div>
                <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <BookOpen className="size-3.5" />
                  Courses
                </div>
                <div className="space-y-0.5">
                  {courses.map((course) => {
                    const isExpanded = expandedCourses.has(course.id);
                    const isCourseSelected =
                      destination?.type === 'course' &&
                      destination.courseId === course.id &&
                      !destination.weekId;
                    const isCourseCurrentLocation =
                      currentLocation?.type === 'course' &&
                      currentLocation.courseId === course.id &&
                      !currentLocation.weekId;

                    return (
                      <div key={course.id}>
                        <div className="flex items-center">
                          <button
                            type="button"
                            className="flex size-6 items-center justify-center rounded hover:bg-accent"
                            onClick={() => toggleCourseExpand(course.id)}
                            aria-label={
                              isExpanded
                                ? `Collapse ${course.name}`
                                : `Expand ${course.name}`
                            }
                          >
                            {isExpanded ? (
                              <ChevronDown className="size-3.5" />
                            ) : (
                              <ChevronRight className="size-3.5" />
                            )}
                          </button>
                          <button
                            type="button"
                            className={cn(
                              'flex flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent',
                              isCourseSelected &&
                                'bg-primary/10 font-medium text-primary',
                              isCourseCurrentLocation &&
                                !isCourseSelected &&
                                'text-muted-foreground',
                            )}
                            onClick={() =>
                              setDestination({
                                type: 'course',
                                courseId: course.id,
                              })
                            }
                          >
                            <div
                              className="size-2.5 rounded-full"
                              style={{ backgroundColor: course.color }}
                            />
                            <span className="flex-1">{course.name}</span>
                            {isCourseCurrentLocation && (
                              <span className="text-[10px] text-muted-foreground">
                                current
                              </span>
                            )}
                          </button>
                        </div>

                        {isExpanded &&
                          course.weeks.map((week) => {
                            const isWeekSelected =
                              destination?.type === 'course' &&
                              destination.courseId === course.id &&
                              destination.weekId === week.id;
                            const isWeekCurrentLocation =
                              currentLocation?.type === 'course' &&
                              currentLocation.courseId === course.id &&
                              currentLocation.weekId === week.id;

                            return (
                              <button
                                key={week.id}
                                type="button"
                                className={cn(
                                  'ml-6 flex w-[calc(100%-1.5rem)] items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent',
                                  isWeekSelected &&
                                    'bg-primary/10 font-medium text-primary',
                                  isWeekCurrentLocation &&
                                    !isWeekSelected &&
                                    'text-muted-foreground',
                                )}
                                onClick={() =>
                                  setDestination({
                                    type: 'course',
                                    courseId: course.id,
                                    weekId: week.id,
                                  })
                                }
                              >
                                <span className="flex-1">
                                  Week {week.week_number}
                                  {week.topic ? ` \u2014 ${week.topic}` : ''}
                                </span>
                                {isWeekCurrentLocation && (
                                  <span className="text-[10px] text-muted-foreground">
                                    current
                                  </span>
                                )}
                              </button>
                            );
                          })}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Folders section */}
            {folders.length > 0 && (
              <div>
                <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <FolderOpen className="size-3.5" />
                  Folders
                </div>
                <div className="space-y-0.5">
                  {folders.map((folder) => {
                    const isFolderSelected =
                      destination?.type === 'folder' &&
                      destination.folderId === folder.id;
                    const isFolderCurrentLocation =
                      currentLocation?.type === 'folder' &&
                      currentLocation.folderId === folder.id;

                    return (
                      <button
                        key={folder.id}
                        type="button"
                        className={cn(
                          'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent',
                          isFolderSelected &&
                            'bg-primary/10 font-medium text-primary',
                          isFolderCurrentLocation &&
                            !isFolderSelected &&
                            'text-muted-foreground',
                        )}
                        onClick={() =>
                          setDestination({
                            type: 'folder',
                            folderId: folder.id,
                          })
                        }
                      >
                        <div
                          className="size-2.5 rounded-full"
                          style={{ backgroundColor: folder.color }}
                        />
                        <span className="flex-1">{folder.name}</span>
                        {isFolderCurrentLocation && (
                          <span className="text-[10px] text-muted-foreground">
                            current
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* New folder inline form */}
            <div>
              {showNewFolder ? (
                <div className="flex items-center gap-2">
                  <Input
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    placeholder="Folder name"
                    className="h-8 text-sm"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleCreateFolder();
                      }
                      if (e.key === 'Escape') {
                        setShowNewFolder(false);
                        setNewFolderName('');
                      }
                    }}
                    disabled={creatingFolder}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleCreateFolder}
                    disabled={!newFolderName.trim() || creatingFolder}
                    className="h-8 shrink-0"
                  >
                    {creatingFolder ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      'Create'
                    )}
                  </Button>
                </div>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-muted-foreground"
                  onClick={() => setShowNewFolder(true)}
                >
                  <Plus className="mr-1 size-3.5" />
                  New Folder
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Material link warning */}
        {showMaterialWarning && (
          <div className="flex items-start gap-2 rounded-md border border-yellow-500/30 bg-yellow-500/10 px-3 py-2">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-yellow-600" />
            <p className="text-xs text-yellow-700 dark:text-yellow-400">
              This document is linked to a course material. Moving it to a
              different course will remove the material link.
            </p>
          </div>
        )}

        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={moving}
          >
            Cancel
          </Button>
          <Button
            onClick={handleMove}
            disabled={!destination || isCurrentLocation || moving || loading}
          >
            {moving ? (
              <>
                <Loader2 className="mr-1 size-3.5 animate-spin" />
                Moving...
              </>
            ) : (
              'Move Here'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
