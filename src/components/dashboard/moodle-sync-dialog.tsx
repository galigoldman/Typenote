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
import type {
  CourseComparison,
  CourseComparisonStatus,
} from '@/lib/moodle/sync-service';

interface MoodleSyncDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  moodleConnection: { domain: string; instanceId: string };
}

type DialogPhase =
  | 'scraping'
  | 'comparing'
  | 'select-courses'
  | 'scraping-content'
  | 'select-content'
  | 'syncing'
  | 'done'
  | 'error';

interface ScrapedSection {
  moodleSectionId: string;
  title: string;
  position: number;
  items: ScrapedItem[];
}

interface ScrapedItem {
  type: 'file' | 'link';
  name: string;
  moodleUrl: string;
  externalUrl?: string;
  fileSize?: number;
  mimeType?: string;
}

interface CourseWithContent {
  moodleCourseId: string;
  name: string;
  moodleUrl: string;
  status: CourseComparisonStatus;
  sections: ScrapedSection[];
}

const AUTH_ERROR_PATTERNS = [
  '403', 'forbidden', 'unauthorized', 'login required', 'session expired',
];

function isAuthError(message: string): boolean {
  const lower = message.toLowerCase();
  return AUTH_ERROR_PATTERNS.some((p) => lower.includes(p));
}

const STATUS_BADGE_MAP: Record<
  CourseComparisonStatus,
  { label: string; variant: 'default' | 'secondary' | 'outline' }
> = {
  new_to_system: { label: 'New', variant: 'default' },
  synced_by_others: { label: 'Available', variant: 'secondary' },
  synced_by_user: { label: 'Synced', variant: 'outline' },
  has_new_items: { label: 'New Items', variant: 'default' },
};

export function MoodleSyncDialog({
  open,
  onOpenChange,
  moodleConnection,
}: MoodleSyncDialogProps) {
  const { scrapeCourses, scrapeCourseContent } = useMoodleExtension();

  const [phase, setPhase] = useState<DialogPhase>('scraping');
  const [courses, setCourses] = useState<CourseComparison[]>([]);
  const [selectedCourseIds, setSelectedCourseIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [authError, setAuthError] = useState(false);
  const [progress, setProgress] = useState('');

  // Phase 2: content selection
  const [coursesWithContent, setCoursesWithContent] = useState<CourseWithContent[]>([]);
  // Set of "courseId::sectionId" keys for selected sections
  const [selectedSections, setSelectedSections] = useState<Set<string>>(new Set());
  // Set of "courseId::sectionId::moodleUrl" keys for deselected individual items
  const [deselectedItems, setDeselectedItems] = useState<Set<string>>(new Set());
  // Collapsed sections
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

  const [syncedCount, setSyncedCount] = useState(0);

  // ---- Helpers for content selection ----
  function sectionKey(courseId: string, sectionId: string) {
    return `${courseId}::${sectionId}`;
  }
  function itemKey(courseId: string, sectionId: string, moodleUrl: string) {
    return `${courseId}::${sectionId}::${moodleUrl}`;
  }

  function isSectionSelected(courseId: string, sectionId: string) {
    return selectedSections.has(sectionKey(courseId, sectionId));
  }

  function isItemSelected(courseId: string, sectionId: string, moodleUrl: string) {
    return isSectionSelected(courseId, sectionId) &&
      !deselectedItems.has(itemKey(courseId, sectionId, moodleUrl));
  }

  function toggleSection(courseId: string, sectionId: string) {
    const key = sectionKey(courseId, sectionId);
    setSelectedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
    // Clear individual deselections for this section
    setDeselectedItems((prev) => {
      const next = new Set(prev);
      for (const k of prev) {
        if (k.startsWith(key + '::')) next.delete(k);
      }
      return next;
    });
  }

  function toggleItem(courseId: string, sectionId: string, moodleUrl: string) {
    const sk = sectionKey(courseId, sectionId);
    const ik = itemKey(courseId, sectionId, moodleUrl);

    if (!selectedSections.has(sk)) {
      // Section not selected, select it but deselect all items except this one
      setSelectedSections((prev) => new Set(prev).add(sk));
      // Find all items in this section and deselect them except the clicked one
      const course = coursesWithContent.find((c) => c.moodleCourseId === courseId);
      const section = course?.sections.find((s) => s.moodleSectionId === sectionId);
      if (section) {
        const newDeselected = new Set(deselectedItems);
        for (const item of section.items) {
          if (item.moodleUrl !== moodleUrl) {
            newDeselected.add(itemKey(courseId, sectionId, item.moodleUrl));
          }
        }
        setDeselectedItems(newDeselected);
      }
      return;
    }

    setDeselectedItems((prev) => {
      const next = new Set(prev);
      if (next.has(ik)) {
        next.delete(ik);
      } else {
        next.add(ik);
      }
      return next;
    });
  }

  function toggleCollapse(courseId: string, sectionId: string) {
    const key = sectionKey(courseId, sectionId);
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function selectAll() {
    const allKeys = new Set<string>();
    for (const course of coursesWithContent) {
      for (const section of course.sections) {
        if (section.items.length > 0) {
          allKeys.add(sectionKey(course.moodleCourseId, section.moodleSectionId));
        }
      }
    }
    setSelectedSections(allKeys);
    setDeselectedItems(new Set());
  }

  function deselectAll() {
    setSelectedSections(new Set());
    setDeselectedItems(new Set());
  }

  function getSelectedItemCount(): number {
    let count = 0;
    for (const course of coursesWithContent) {
      for (const section of course.sections) {
        if (!isSectionSelected(course.moodleCourseId, section.moodleSectionId)) continue;
        for (const item of section.items) {
          if (isItemSelected(course.moodleCourseId, section.moodleSectionId, item.moodleUrl)) {
            count++;
          }
        }
      }
    }
    return count;
  }

  // ---- Phase 1: Load courses ----
  const loadCourses = useCallback(async () => {
    setPhase('scraping');
    setError(null);
    setAuthError(false);
    setCourses([]);
    setSelectedCourseIds(new Set());

    try {
      const scrapeResult = await scrapeCourses(
        `https://${moodleConnection.domain}`,
      );

      if (!scrapeResult || scrapeResult.courses.length === 0) {
        setCourses([]);
        setPhase('select-courses');
        return;
      }

      setPhase('comparing');
      const comparisons = await compareScrapedCourses(
        moodleConnection.domain,
        scrapeResult.courses,
      );

      setCourses(comparisons);

      // Pre-select new or updated courses
      const preSelected = new Set(
        comparisons
          .filter((c) => c.status !== 'synced_by_user')
          .map((c) => c.moodleCourseId),
      );
      setSelectedCourseIds(preSelected);
      setPhase('select-courses');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load courses';
      setError(message);
      setAuthError(isAuthError(message));
      setPhase('error');
    }
  }, [scrapeCourses, moodleConnection.domain]);

  useEffect(() => {
    if (open) {
      loadCourses();
    }
  }, [open, loadCourses]);

  function toggleCourse(moodleCourseId: string) {
    setSelectedCourseIds((prev) => {
      const next = new Set(prev);
      if (next.has(moodleCourseId)) next.delete(moodleCourseId);
      else next.add(moodleCourseId);
      return next;
    });
  }

  // ---- Phase 2: Scrape content and show picker ----
  async function handlePreviewContent() {
    setPhase('scraping-content');
    setError(null);

    try {
      const selected = courses.filter((c) => selectedCourseIds.has(c.moodleCourseId));
      const results: CourseWithContent[] = [];

      for (let i = 0; i < selected.length; i++) {
        const course = selected[i];
        setProgress(`Scanning "${course.name}" (${i + 1}/${selected.length})...`);

        const content = await scrapeCourseContent(course.moodleUrl);
        results.push({
          moodleCourseId: course.moodleCourseId,
          name: course.name,
          moodleUrl: course.moodleUrl,
          status: course.status,
          sections: content?.sections ?? [],
        });
      }

      setCoursesWithContent(results);

      // Pre-select all sections that have items
      const preSelectedSections = new Set<string>();
      for (const course of results) {
        for (const section of course.sections) {
          if (section.items.length > 0) {
            preSelectedSections.add(sectionKey(course.moodleCourseId, section.moodleSectionId));
          }
        }
      }
      setSelectedSections(preSelectedSections);
      setDeselectedItems(new Set());
      setCollapsedSections(new Set());
      setPhase('select-content');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to scrape content';
      setError(message);
      setAuthError(isAuthError(message));
      setPhase('error');
    }
  }

  // ---- Phase 3: Sync selected content ----
  async function handleSync() {
    setPhase('syncing');
    setError(null);
    setProgress('Saving to registry...');

    try {
      // Build payloads with only selected sections/items
      const coursePayloads = coursesWithContent.map((course) => ({
        moodleCourseId: course.moodleCourseId,
        name: course.name,
        moodleUrl: course.moodleUrl,
        sections: course.sections
          .filter((s) => isSectionSelected(course.moodleCourseId, s.moodleSectionId))
          .map((s) => ({
            moodleSectionId: s.moodleSectionId,
            title: s.title,
            position: s.position,
            items: s.items.filter((item) =>
              isItemSelected(course.moodleCourseId, s.moodleSectionId, item.moodleUrl),
            ),
          }))
          .filter((s) => s.items.length > 0),
      })).filter((c) => c.sections.length > 0);

      if (coursePayloads.length === 0) {
        setError('No items selected to sync');
        setPhase('select-content');
        return;
      }

      const result = await syncMoodleCourses(
        moodleConnection.domain,
        coursePayloads,
      );

      setSyncedCount(result.syncedCount);
      setPhase('done');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sync failed';
      setError(message);
      setAuthError(isAuthError(message));
      setPhase('error');
    }
  }

  // ---- Render ----
  const totalItems = coursesWithContent.reduce(
    (sum, c) => sum + c.sections.reduce((s2, s) => s2 + s.items.length, 0),
    0,
  );
  const selectedItemCount = phase === 'select-content' ? getSelectedItemCount() : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {phase === 'select-content' ? 'Select Materials to Sync' : 'Sync Moodle Courses'}
          </DialogTitle>
          <DialogDescription>
            {phase === 'select-content'
              ? `Choose which files and sections to import (${selectedItemCount}/${totalItems} selected)`
              : `Select courses from ${moodleConnection.domain}`}
          </DialogDescription>
        </DialogHeader>

        {/* Loading phases */}
        {(phase === 'scraping' || phase === 'comparing' || phase === 'scraping-content' || phase === 'syncing') && (
          <div className="flex items-center justify-center py-8">
            <p className="text-sm text-muted-foreground">
              {phase === 'scraping' && 'Scanning Moodle for courses...'}
              {phase === 'comparing' && 'Checking course status...'}
              {phase === 'scraping-content' && progress}
              {phase === 'syncing' && progress}
            </p>
          </div>
        )}

        {/* Phase 1: Course selection */}
        {phase === 'select-courses' && courses.length === 0 && (
          <div className="flex items-center justify-center py-8">
            <p className="text-sm text-muted-foreground">No courses found on Moodle.</p>
          </div>
        )}

        {phase === 'select-courses' && courses.length > 0 && (
          <div className="space-y-2">
            {courses.map((course) => {
              const badgeInfo = STATUS_BADGE_MAP[course.status];
              return (
                <label
                  key={course.moodleCourseId}
                  className="flex cursor-pointer items-center gap-3 rounded-md border p-3 hover:bg-accent/50"
                >
                  <Checkbox
                    checked={selectedCourseIds.has(course.moodleCourseId)}
                    onCheckedChange={() => toggleCourse(course.moodleCourseId)}
                    aria-label={`Select ${course.name}`}
                  />
                  <span className="flex-1 text-sm font-medium">{course.name}</span>
                  <Badge variant={badgeInfo.variant}>{badgeInfo.label}</Badge>
                </label>
              );
            })}
          </div>
        )}

        {/* Phase 2: Content selection */}
        {phase === 'select-content' && (
          <div className="space-y-3">
            {/* Select all / Deselect all */}
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={selectAll}>
                Select All
              </Button>
              <Button variant="outline" size="sm" onClick={deselectAll}>
                Deselect All
              </Button>
            </div>

            {coursesWithContent.map((course) => (
              <div key={course.moodleCourseId} className="space-y-1">
                {/* Course header */}
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-semibold">{course.name}</h4>
                  {course.status === 'synced_by_user' && (
                    <Badge variant="outline" className="text-xs">Previously Synced</Badge>
                  )}
                </div>

                {course.sections.length === 0 && (
                  <p className="text-xs text-muted-foreground pl-2">No materials found</p>
                )}

                {/* Sections */}
                {course.sections.filter((s) => s.items.length > 0).map((section) => {
                  const sk = sectionKey(course.moodleCourseId, section.moodleSectionId);
                  const isCollapsed = collapsedSections.has(sk);
                  const sectionSelected = isSectionSelected(course.moodleCourseId, section.moodleSectionId);
                  const selectedInSection = section.items.filter((item) =>
                    isItemSelected(course.moodleCourseId, section.moodleSectionId, item.moodleUrl),
                  ).length;

                  return (
                    <div key={sk} className="rounded-md border">
                      {/* Section header */}
                      <div className="flex items-center gap-2 p-2 bg-muted/30">
                        <Checkbox
                          checked={sectionSelected}
                          onCheckedChange={() => toggleSection(course.moodleCourseId, section.moodleSectionId)}
                          aria-label={`Select section ${section.title}`}
                        />
                        <button
                          type="button"
                          className="flex-1 text-left text-sm font-medium hover:underline"
                          onClick={() => toggleCollapse(course.moodleCourseId, section.moodleSectionId)}
                        >
                          {section.title}
                        </button>
                        <span className="text-xs text-muted-foreground">
                          {sectionSelected ? `${selectedInSection}/` : ''}{section.items.length} items
                        </span>
                        <button
                          type="button"
                          className="text-xs text-muted-foreground hover:text-foreground"
                          onClick={() => toggleCollapse(course.moodleCourseId, section.moodleSectionId)}
                        >
                          {isCollapsed ? '▸' : '▾'}
                        </button>
                      </div>

                      {/* Items */}
                      {!isCollapsed && (
                        <div className="divide-y">
                          {section.items.map((item) => {
                            const selected = isItemSelected(
                              course.moodleCourseId,
                              section.moodleSectionId,
                              item.moodleUrl,
                            );
                            return (
                              <label
                                key={item.moodleUrl}
                                className="flex cursor-pointer items-center gap-2 px-3 py-1.5 hover:bg-accent/30"
                              >
                                <Checkbox
                                  checked={selected}
                                  onCheckedChange={() =>
                                    toggleItem(course.moodleCourseId, section.moodleSectionId, item.moodleUrl)
                                  }
                                  aria-label={`Select ${item.name}`}
                                />
                                <span className="flex-1 text-xs truncate">{item.name}</span>
                                <Badge variant="outline" className="text-[10px] px-1">
                                  {item.type === 'file' ? (item.mimeType?.split('/')[1] ?? 'file') : 'link'}
                                </Badge>
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}

                <Separator className="my-2" />
              </div>
            ))}
          </div>
        )}

        {/* Done phase */}
        {phase === 'done' && (
          <div className="flex flex-col items-center gap-2 py-8">
            <p className="text-sm font-medium">
              Successfully synced {syncedCount} {syncedCount === 1 ? 'course' : 'courses'}
            </p>
            <p className="text-xs text-muted-foreground">
              Files are now in the Moodle registry. Use the file picker to import them into your notes.
            </p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="space-y-2">
            <p className="text-sm text-destructive" role="alert">{error}</p>
            {authError && (
              <p className="text-xs text-muted-foreground">
                Your Moodle session may have expired.{' '}
                <a
                  href={`https://${moodleConnection.domain}`}
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
          {phase === 'select-courses' && courses.length > 0 && (
            <Button onClick={handlePreviewContent} disabled={selectedCourseIds.size === 0}>
              Preview Content ({selectedCourseIds.size})
            </Button>
          )}
          {phase === 'select-content' && (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setPhase('select-courses')}>
                Back
              </Button>
              <Button onClick={handleSync} disabled={selectedItemCount === 0}>
                Sync Selected ({selectedItemCount})
              </Button>
            </div>
          )}
          {phase === 'done' && (
            <Button onClick={() => onOpenChange(false)}>Close</Button>
          )}
          {phase === 'error' && (
            <Button variant="outline" onClick={loadCourses}>Retry</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
