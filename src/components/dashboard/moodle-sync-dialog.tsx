'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useMoodleExtension } from '@/hooks/use-moodle-extension';
import {
  compareScrapedCourses,
  syncMoodleCourses,
} from '@/lib/actions/moodle-sync';
import { MoodleFilePicker } from './moodle-file-picker';
import type {
  CourseComparison,
  CourseComparisonStatus,
} from '@/lib/moodle/sync-service';
import type { SyncCourseResult } from '@/lib/moodle/types';

interface MoodleSyncDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  moodleConnection: { domain: string; instanceId: string };
}

type DialogPhase = 'scraping' | 'comparing' | 'ready' | 'syncing' | 'done' | 'error';

/** Error messages that suggest a Moodle session has expired */
const AUTH_ERROR_PATTERNS = [
  '403',
  'forbidden',
  'unauthorized',
  'login required',
  'session expired',
];

function isAuthError(message: string): boolean {
  const lower = message.toLowerCase();
  return AUTH_ERROR_PATTERNS.some((pattern) => lower.includes(pattern));
}

const STATUS_BADGE_MAP: Record<
  CourseComparisonStatus,
  { label: string; variant: 'default' | 'secondary' | 'outline' }
> = {
  new_to_system: { label: 'New', variant: 'default' },
  synced_by_others: { label: 'Available', variant: 'secondary' },
  synced_by_user: { label: 'Already Synced', variant: 'outline' },
  has_new_items: { label: 'New Items', variant: 'default' },
};

export function MoodleSyncDialog({
  open,
  onOpenChange,
  moodleConnection,
}: MoodleSyncDialogProps) {
  const { scrapeCourses } = useMoodleExtension();

  const [phase, setPhase] = useState<DialogPhase>('scraping');
  const [courses, setCourses] = useState<CourseComparison[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [authError, setAuthError] = useState(false);
  const [syncedCount, setSyncedCount] = useState(0);
  const [syncedCourses, setSyncedCourses] = useState<SyncCourseResult[]>([]);
  const [expandedFilePicker, setExpandedFilePicker] = useState<string | null>(null);

  const loadCourses = useCallback(async () => {
    setPhase('scraping');
    setError(null);
    setAuthError(false);
    setCourses([]);
    setSelectedIds(new Set());

    try {
      // Step 1: Scrape courses from Moodle via extension
      const scrapeResult = await scrapeCourses(
        `https://${moodleConnection.domain}`,
      );

      if (!scrapeResult || scrapeResult.courses.length === 0) {
        setCourses([]);
        setPhase('ready');
        return;
      }

      // Step 2: Compare against registry
      setPhase('comparing');
      const comparisons = await compareScrapedCourses(
        moodleConnection.domain,
        scrapeResult.courses,
      );

      setCourses(comparisons);

      // Pre-select courses that are new or have new items
      const preSelected = new Set(
        comparisons
          .filter(
            (c) => c.status === 'new_to_system' || c.status === 'has_new_items',
          )
          .map((c) => c.moodleCourseId),
      );
      setSelectedIds(preSelected);
      setPhase('ready');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load courses';
      setError(message);
      setAuthError(isAuthError(message));
      setPhase('error');
    }
  }, [scrapeCourses, moodleConnection.domain]);

  // Load courses when dialog opens
  /* eslint-disable react-hooks/set-state-in-effect -- async data fetch on dialog open */
  useEffect(() => {
    if (open) {
      void loadCourses();
    }
  }, [open, loadCourses]);
  /* eslint-enable react-hooks/set-state-in-effect */

  function toggleCourse(moodleCourseId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(moodleCourseId)) {
        next.delete(moodleCourseId);
      } else {
        next.add(moodleCourseId);
      }
      return next;
    });
  }

  async function handleSync() {
    setPhase('syncing');
    setError(null);
    setAuthError(false);

    try {
      const selected = courses.filter((c) =>
        selectedIds.has(c.moodleCourseId),
      );

      // Build payloads with empty sections (real content scraping deferred)
      const coursePayloads = selected.map((c) => ({
        moodleCourseId: c.moodleCourseId,
        name: c.name,
        moodleUrl: c.moodleUrl,
        sections: [] as Array<{
          moodleSectionId: string;
          title: string;
          position: number;
          items: Array<{
            type: 'file' | 'link';
            name: string;
            moodleUrl: string;
            externalUrl?: string;
            fileSize?: number;
            mimeType?: string;
          }>;
        }>,
      }));

      const result = await syncMoodleCourses(
        moodleConnection.domain,
        coursePayloads,
      );

      setSyncedCount(result.syncedCount);
      setSyncedCourses(result.courses);
      setPhase('done');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sync failed';
      setError(message);
      setAuthError(isAuthError(message));
      setPhase('error');
    }
  }

  function handleClose() {
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Sync Moodle Courses</DialogTitle>
          <DialogDescription>
            Select courses from{' '}
            <strong>{moodleConnection.domain}</strong> to sync.
          </DialogDescription>
        </DialogHeader>

        {/* Scraping phase */}
        {phase === 'scraping' && (
          <div className="flex items-center justify-center py-8">
            <p className="text-sm text-muted-foreground">
              Scanning Moodle for courses...
            </p>
          </div>
        )}

        {/* Comparing phase */}
        {phase === 'comparing' && (
          <div className="flex items-center justify-center py-8">
            <p className="text-sm text-muted-foreground">
              Checking course status...
            </p>
          </div>
        )}

        {/* Ready / course list */}
        {phase === 'ready' && courses.length === 0 && (
          <div className="flex items-center justify-center py-8">
            <p className="text-sm text-muted-foreground">
              No courses found on Moodle.
            </p>
          </div>
        )}

        {phase === 'ready' && courses.length > 0 && (
          <div className="space-y-2">
            {courses.map((course) => {
              const badgeInfo = STATUS_BADGE_MAP[course.status];
              return (
                <label
                  key={course.moodleCourseId}
                  className="flex cursor-pointer items-center gap-3 rounded-md border p-3 hover:bg-accent/50"
                >
                  <Checkbox
                    checked={selectedIds.has(course.moodleCourseId)}
                    onCheckedChange={() =>
                      toggleCourse(course.moodleCourseId)
                    }
                    aria-label={`Select ${course.name}`}
                  />
                  <span className="flex-1 text-sm font-medium">
                    {course.name}
                  </span>
                  <Badge variant={badgeInfo.variant}>{badgeInfo.label}</Badge>
                </label>
              );
            })}
          </div>
        )}

        {/* Syncing phase */}
        {phase === 'syncing' && (
          <div className="flex items-center justify-center py-8">
            <p className="text-sm text-muted-foreground">
              Syncing selected courses...
            </p>
          </div>
        )}

        {/* Done phase */}
        {phase === 'done' && (
          <div className="flex flex-col gap-3 py-4">
            <p className="text-center text-sm font-medium">
              Successfully synced {syncedCount}{' '}
              {syncedCount === 1 ? 'course' : 'courses'}
            </p>

            {/* Per-course "View Files" buttons */}
            {syncedCourses.length > 0 && (
              <div className="space-y-2">
                <Separator />
                <p className="text-xs text-muted-foreground">
                  Browse and import files from synced courses:
                </p>
                {syncedCourses.map((sc) => {
                  const originalCourse = courses.find(
                    (c) => c.moodleCourseId === sc.moodleCourseId,
                  );
                  const isExpanded = expandedFilePicker === sc.id;

                  return (
                    <div key={sc.id} className="space-y-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full justify-between"
                        onClick={() =>
                          setExpandedFilePicker(isExpanded ? null : sc.id)
                        }
                        aria-label={`View files for ${originalCourse?.name ?? sc.moodleCourseId}`}
                      >
                        <span className="truncate">
                          {originalCourse?.name ?? sc.moodleCourseId}
                        </span>
                        <span className="text-muted-foreground">
                          {isExpanded ? 'Hide Files' : 'View Files'}
                        </span>
                      </Button>

                      {isExpanded && originalCourse && (
                        <MoodleFilePicker
                          moodleCourseId={sc.id}
                          moodleCourseMoodleId={sc.moodleCourseId}
                          courseUrl={originalCourse.moodleUrl}
                          instanceDomain={moodleConnection.domain}
                          onImportComplete={() => {
                            // Could refresh status or close
                          }}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Error phase */}
        {error && (
          <div className="space-y-2">
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
            {authError && (
              <p className="text-xs text-muted-foreground">
                Your Moodle session may have expired.{' '}
                <a
                  href={`https://${moodleConnection.domain}/login`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  Re-log into Moodle
                </a>{' '}
                and try again.
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          {phase === 'ready' && courses.length > 0 && (
            <Button
              onClick={handleSync}
              disabled={selectedIds.size === 0}
            >
              Sync Selected ({selectedIds.size})
            </Button>
          )}
          {phase === 'done' && (
            <Button onClick={handleClose}>Close</Button>
          )}
          {phase === 'error' && (
            <Button variant="outline" onClick={loadCourses}>
              Retry
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
