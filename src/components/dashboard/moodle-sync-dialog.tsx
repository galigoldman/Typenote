'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Puzzle } from 'lucide-react';
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
import { useMoodleExtension } from '@/hooks/use-moodle-extension';
import { createClient } from '@/lib/supabase/client';
import {
  compareScrapedCourses,
  syncMoodleCourses,
  getExistingFileUrls,
} from '@/lib/actions/moodle-sync';
import { runWithConcurrency } from '@/lib/concurrency';
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
  | 'awaiting-permission'
  | 'awaiting-login'
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
  '403',
  'forbidden',
  'unauthorized',
  'login required',
  'session expired',
];

function isAuthError(message: string): boolean {
  const lower = message.toLowerCase();
  return AUTH_ERROR_PATTERNS.some((p) => lower.includes(p));
}

const NETWORK_ERROR_PATTERNS = ['network', 'fetch', 'timeout', 'offline'];

function isNetworkError(message: string): boolean {
  const lower = message.toLowerCase();
  return NETWORK_ERROR_PATTERNS.some((p) => lower.includes(p));
}

const PERMISSION_ERROR_PATTERNS = [
  'permission',
  'host not allowed',
  'no access',
];

function isPermissionError(message: string): boolean {
  const lower = message.toLowerCase();
  return PERMISSION_ERROR_PATTERNS.some((p) => lower.includes(p));
}

// Course statuses are per-user (see compareCourses): only `new_to_system`
// and `synced_by_user` are actually returned. The other type members exist
// for backward compatibility and never reach the badge map at runtime.
const STATUS_BADGE_MAP: Record<
  CourseComparisonStatus,
  { label: string; variant: 'default' | 'secondary' | 'outline' }
> = {
  new_to_system: { label: 'New', variant: 'default' },
  synced_by_others: { label: 'New', variant: 'default' },
  synced_by_user: { label: 'Synced', variant: 'outline' },
  has_new_items: { label: 'New', variant: 'default' },
};

function friendlyFileLabel(mimeType: string | undefined): string {
  if (!mimeType) return 'file';
  if (mimeType === 'application/pdf') return 'PDF';
  if (
    mimeType.includes('wordprocessingml') ||
    mimeType === 'application/msword'
  )
    return 'DOCX';
  if (mimeType.includes('presentationml') || mimeType.includes('ms-powerpoint'))
    return 'PPTX';
  return 'file';
}

// How many Moodle files to process at once. The extension resolves+downloads
// each file via a credentialed fetch (no browser window anymore), so several in
// parallel is a big speedup over the old one-at-a-time loop. Kept at 4 on
// purpose: each file's upload-finalize runs AI indexing (per-chunk embedding
// calls) synchronously server-side, so a higher fan-out just overloads the
// embedding API (observed: multi-minute finalizes + "fetch failed") without
// downloading any faster. Raise this only once indexing moves off the
// finalize path. The worker pool re-checks cancellation before each new file,
// so Cancel / closing the dialog still stops promptly.
const DOWNLOAD_CONCURRENCY = 4;

export function MoodleSyncDialog({
  open,
  onOpenChange,
  moodleConnection,
}: MoodleSyncDialogProps) {
  const {
    scrapeCourses,
    scrapeCourseContent,
    downloadAndUpload,
    requestPermission,
    checkPermission,
    checkMoodleLogin,
  } = useMoodleExtension();
  const supabaseRef = useRef(createClient());

  const [phase, setPhase] = useState<DialogPhase>('scraping');
  // Ref-based cancellation so polling stops when the user clicks Cancel
  // or closes the dialog. A boolean ref is enough — each loadCourses call
  // bumps it to invalidate any prior polling iteration.
  const pollCancelRef = useRef(false);
  const [courses, setCourses] = useState<CourseComparison[]>([]);
  const [selectedCourseIds, setSelectedCourseIds] = useState<Set<string>>(
    new Set(),
  );
  const [error, setError] = useState<string | null>(null);
  const [authError, setAuthError] = useState(false);
  const [networkError, setNetworkError] = useState(false);
  const [permissionError, setPermissionError] = useState(false);
  const [noCoursesError, setNoCoursesError] = useState(false);
  const [debugInfo, setDebugInfo] = useState<string | null>(null);
  const [progress, setProgress] = useState('');

  // Phase 2: content selection
  const [coursesWithContent, setCoursesWithContent] = useState<
    CourseWithContent[]
  >([]);
  // Set of "courseId::sectionId" keys for selected sections
  const [selectedSections, setSelectedSections] = useState<Set<string>>(
    new Set(),
  );
  // Set of "courseId::sectionId::moodleUrl" keys for deselected individual items
  const [deselectedItems, setDeselectedItems] = useState<Set<string>>(
    new Set(),
  );
  // Collapsed sections
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(
    new Set(),
  );
  // Set of moodle URLs already in the registry (already synced)
  const [alreadySyncedUrls, setAlreadySyncedUrls] = useState<Set<string>>(
    new Set(),
  );

  const [syncedCount, setSyncedCount] = useState(0);
  const [downloadedCount, setDownloadedCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [totalFileJobs, setTotalFileJobs] = useState(0);
  const [failedJobs, setFailedJobs] = useState<
    Array<{ moodleUrl: string; fileName: string; sectionId: string }>
  >([]);

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

  function isItemSelected(
    courseId: string,
    sectionId: string,
    moodleUrl: string,
  ) {
    return (
      isSectionSelected(courseId, sectionId) &&
      !deselectedItems.has(itemKey(courseId, sectionId, moodleUrl))
    );
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
      const course = coursesWithContent.find(
        (c) => c.moodleCourseId === courseId,
      );
      const section = course?.sections.find(
        (s) => s.moodleSectionId === sectionId,
      );
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
          allKeys.add(
            sectionKey(course.moodleCourseId, section.moodleSectionId),
          );
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
        if (!isSectionSelected(course.moodleCourseId, section.moodleSectionId))
          continue;
        for (const item of section.items) {
          if (
            isItemSelected(
              course.moodleCourseId,
              section.moodleSectionId,
              item.moodleUrl,
            )
          ) {
            count++;
          }
        }
      }
    }
    return count;
  }

  /**
   * Poll the extension until permission for the Moodle host is granted,
   * or the user cancels (which bumps pollCancelRef.current to true).
   */
  const waitForPermission = useCallback(
    async (moodleUrl: string): Promise<boolean> => {
      pollCancelRef.current = false;
      const startedAt = Date.now();
      const timeoutMs = 5 * 60 * 1000;
      while (!pollCancelRef.current) {
        if (Date.now() - startedAt > timeoutMs) return false;
        const granted = await checkPermission(moodleUrl);
        if (granted) return true;
        await new Promise((resolve) => setTimeout(resolve, 1200));
      }
      return false;
    },
    [checkPermission],
  );

  // ---- Phase 1: Load courses ----
  const loadCourses = useCallback(async () => {
    // Fresh run — clear any stale cancel flag left by a previous close, so the
    // scrape/permission path can't inherit a `true` from an earlier session.
    pollCancelRef.current = false;
    setError(null);
    setAuthError(false);
    setNetworkError(false);
    setPermissionError(false);
    setNoCoursesError(false);
    setDebugInfo(null);
    setCourses([]);
    setSelectedCourseIds(new Set());

    const moodleUrl = `https://${moodleConnection.domain}`;

    // Permission gate: declared host_permissions in the manifest are narrow
    // (Typenote only); Moodle hosts must be granted at runtime. If we don't
    // have the permission yet, kick off the popup handshake before even
    // trying to scrape — otherwise we'd just get a confusing
    // "Cannot access contents of the page" error.
    setPhase('scraping');
    const hasPermission = await checkPermission(moodleUrl);
    if (!hasPermission) {
      const reqResult = await requestPermission(moodleUrl);
      if (!reqResult.granted) {
        if ('needsPopup' in reqResult && reqResult.needsPopup) {
          setPhase('awaiting-permission');
          const ok = await waitForPermission(moodleUrl);
          if (!ok) {
            // Distinguish user cancel from timeout: the Cancel button sets
            // pollCancelRef.current to true AND transitions to 'error' with
            // its own message, so we only need to handle the timeout path.
            if (!pollCancelRef.current) {
              setError('Permission grant timed out. Click Retry to try again.');
              setPhase('error');
            }
            return;
          }
          setPhase('scraping');
        } else {
          setError(
            reqResult.error ??
              'Could not request permission. Reinstall the extension and try again.',
          );
          setPhase('error');
          return;
        }
      }
    }

    try {
      const scrapeResult = await scrapeCourses(moodleUrl);

      if (!scrapeResult) {
        setError(
          'Could not communicate with the Typenote extension. ' +
            'Make sure the extension is installed and reload the page.',
        );
        setPhase('error');
        return;
      }

      if (scrapeResult.courses.length === 0) {
        // Differentiate "logged in but no courses" from "actually a login
        // page". The scraper returns _debug with the post-redirect tab URL —
        // if it contains a login URL, the cookie precheck passed but the
        // session was stale (still surface as a login prompt).
        const debug = (scrapeResult as Record<string, unknown>)._debug as
          | { title: string; url: string; cardCount: number }
          | undefined;
        if (debug && /\/login\/|sso|saml/i.test(debug.url)) {
          setPhase('awaiting-login');
          return;
        }
        setError(`Couldn't find any courses on ${moodleConnection.domain}.`);
        setNoCoursesError(true);
        if (debug) {
          setDebugInfo(
            `Page: "${debug.title}" at ${debug.url} (${debug.cardCount} cards)`,
          );
        }
        setPhase('error');
        return;
      }

      setPhase('comparing');
      const comparisons = await compareScrapedCourses(
        moodleConnection.domain,
        scrapeResult.courses,
      );

      setCourses(comparisons);

      const preSelected = new Set(
        comparisons
          .filter((c) => c.status !== 'synced_by_user')
          .map((c) => c.moodleCourseId),
      );
      setSelectedCourseIds(preSelected);
      setPhase('select-courses');
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === 'NOT_LOGGED_IN') {
        setPhase('awaiting-login');
        return;
      }
      if (code === 'PERMISSION_DENIED') {
        // PERMISSION_DENIED is ambiguous from the dashboard side: it can be
        // a genuine permission revocation OR a session expiry whose redirect
        // landed on a cross-host SSO page the extension cannot read. Probe
        // login state first so we route to the right UI instead of always
        // blaming permissions. checkMoodleLogin's fast path checks for the
        // MoodleSession cookie and returns loggedIn:false without needing
        // tab access, so it works even when permissions are the issue.
        const loginStatus = await checkMoodleLogin(moodleUrl);
        if (loginStatus?.loggedIn === false) {
          setPhase('awaiting-login');
          return;
        }
        await requestPermission(moodleUrl);
        setPermissionError(true);
        setError(
          'Could not access Moodle. Your session may have expired, or the extension may have lost permission for this host.',
        );
        setPhase('error');
        return;
      }
      const message =
        err instanceof Error ? err.message : 'Failed to load courses';
      setError(message);
      setAuthError(isAuthError(message));
      setNetworkError(isNetworkError(message) && !isAuthError(message));
      setPermissionError(isPermissionError(message) && !isAuthError(message));
      setPhase('error');
    }
  }, [
    scrapeCourses,
    moodleConnection.domain,
    checkPermission,
    requestPermission,
    waitForPermission,
    checkMoodleLogin,
  ]);

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- loadCourses fetches from external Moodle API
      loadCourses();
    } else {
      // Closing the dialog mid-permission-wait must stop the polling loop,
      // otherwise it leaks and could resume into a stale state on re-open.
      pollCancelRef.current = true;
    }
    return () => {
      pollCancelRef.current = true;
    };
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
    // Fresh run — clear any stale cancel flag left by a previous close.
    pollCancelRef.current = false;
    setError(null);

    try {
      const selected = courses.filter((c) =>
        selectedCourseIds.has(c.moodleCourseId),
      );
      const results: CourseWithContent[] = [];

      for (let i = 0; i < selected.length; i++) {
        // Scanning a course opens a Moodle window per course; bail out
        // immediately if the user cancelled instead of grinding through them.
        if (pollCancelRef.current) {
          setPhase('select-courses');
          return;
        }
        const course = selected[i];
        setProgress(
          `Scanning "${course.name}" (${i + 1}/${selected.length})...`,
        );

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

      // Fetch already-synced file URLs for courses that have a registryId
      const existingUrls = new Set<string>();
      for (const course of selected) {
        if (course.registryId) {
          const urls = await getExistingFileUrls(course.registryId);
          for (const u of urls) existingUrls.add(u);
        }
      }
      setProgress('Checking existing files...');
      setAlreadySyncedUrls(existingUrls);

      // Pre-select sections with NEW items (not already synced)
      const preSelectedSections = new Set<string>();
      const preDeselectedItems = new Set<string>();
      for (const course of results) {
        for (const section of course.sections) {
          if (section.items.length === 0) continue;
          const hasNewItems = section.items.some(
            (i) => !existingUrls.has(i.moodleUrl),
          );
          if (hasNewItems) {
            preSelectedSections.add(
              sectionKey(course.moodleCourseId, section.moodleSectionId),
            );
            // Deselect already-synced items within selected sections
            for (const item of section.items) {
              if (existingUrls.has(item.moodleUrl)) {
                preDeselectedItems.add(
                  itemKey(
                    course.moodleCourseId,
                    section.moodleSectionId,
                    item.moodleUrl,
                  ),
                );
              }
            }
          }
        }
      }
      setSelectedSections(preSelectedSections);
      setDeselectedItems(preDeselectedItems);

      // Collapse sections that are fully synced (not selected); expand selected ones
      const preCollapsed = new Set<string>();
      for (const course of results) {
        for (const section of course.sections) {
          if (section.items.length === 0) continue;
          const sk = sectionKey(course.moodleCourseId, section.moodleSectionId);
          if (!preSelectedSections.has(sk)) {
            preCollapsed.add(sk);
          }
        }
      }
      setCollapsedSections(preCollapsed);
      setPhase('select-content');
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to scrape content';
      setError(message);
      setAuthError(isAuthError(message));
      setNetworkError(isNetworkError(message) && !isAuthError(message));
      setPermissionError(isPermissionError(message) && !isAuthError(message));
      setPhase('error');
    }
  }

  // ---- Phase 3: Sync selected content ----
  async function runDownloadJobs(
    jobs: Array<{ moodleUrl: string; fileName: string; sectionId: string }>,
    authToken: string | undefined,
    uploadEndpoint: string,
  ): Promise<{
    downloaded: number;
    failed: number;
    failedJobs: typeof jobs;
    errors: string[];
    cancelled: boolean;
  }> {
    let downloaded = 0;
    let failed = 0;
    const errors: string[] = [];
    const newFailed: typeof jobs = [];

    // Download a few files at once instead of one-by-one. Each worker handles
    // its own failure so a single bad file never rejects the whole pool, and
    // the pool stops pulling new files the moment pollCancelRef flips.
    await runWithConcurrency(
      jobs,
      async (job) => {
        try {
          await downloadAndUpload({
            moodleFileUrl: job.moodleUrl,
            uploadEndpoint,
            authToken,
            metadata: {
              sectionId: job.sectionId,
              moodleUrl: job.moodleUrl,
              fileName: job.fileName,
            },
          });
          downloaded++;
        } catch (dlErr) {
          failed++;
          if (errors.length < 3) {
            errors.push(
              `${job.fileName}: ${dlErr instanceof Error ? dlErr.message : String(dlErr)}`,
            );
          }
          newFailed.push(job);
        }
        setProgress(
          `Downloading files... (${downloaded + failed}/${jobs.length})`,
        );
      },
      {
        concurrency: DOWNLOAD_CONCURRENCY,
        shouldCancel: () => pollCancelRef.current,
      },
    );

    return {
      downloaded,
      failed,
      failedJobs: newFailed,
      errors,
      cancelled: pollCancelRef.current,
    };
  }

  async function handleSync() {
    setPhase('syncing');
    // Fresh run — clear any stale cancel flag left by a previous close.
    pollCancelRef.current = false;
    setError(null);
    setFailedJobs([]);
    setProgress('Saving to registry...');

    try {
      // Build payloads with only selected sections/items
      const coursePayloads = coursesWithContent
        .map((course) => ({
          moodleCourseId: course.moodleCourseId,
          name: course.name,
          moodleUrl: course.moodleUrl,
          sections: course.sections
            .filter((s) =>
              isSectionSelected(course.moodleCourseId, s.moodleSectionId),
            )
            .map((s) => ({
              moodleSectionId: s.moodleSectionId,
              title: s.title,
              position: s.position,
              items: s.items.filter((item) =>
                isItemSelected(
                  course.moodleCourseId,
                  s.moodleSectionId,
                  item.moodleUrl,
                ),
              ),
            }))
            .filter((s) => s.items.length > 0),
        }))
        .filter((c) => c.sections.length > 0);

      if (coursePayloads.length === 0) {
        setError('No items selected to sync');
        setPhase('select-content');
        return;
      }

      // Step 1: Save metadata to registry
      const result = await syncMoodleCourses(
        moodleConnection.domain,
        coursePayloads,
      );

      // Step 2: Download files via extension, upload from web app
      const fileJobs: Array<{
        moodleUrl: string;
        fileName: string;
        sectionId: string;
      }> = [];
      for (const courseResult of result.courses) {
        for (const sectionResult of courseResult.sections) {
          const payloadCourse = coursePayloads.find(
            (c) => c.moodleCourseId === courseResult.moodleCourseId,
          );
          const payloadSection = payloadCourse?.sections.find(
            (s) => s.moodleSectionId === sectionResult.moodleSectionId,
          );
          for (const fileResult of sectionResult.items) {
            const payloadItem = payloadSection?.items.find(
              (i) => i.moodleUrl === fileResult.moodleUrl,
            );
            if (payloadItem?.type === 'file') {
              fileJobs.push({
                moodleUrl: fileResult.moodleUrl,
                fileName: payloadItem.name,
                sectionId: sectionResult.id,
              });
            }
          }
        }
      }

      setTotalFileJobs(fileJobs.length);
      let downloaded = 0;
      let failed = 0;
      let cancelled = false;
      const errors: string[] = [];
      if (fileJobs.length > 0) {
        const {
          data: { session },
        } = await supabaseRef.current.auth.getSession();
        const authToken = session?.access_token;
        const uploadEndpoint = `${window.location.origin}/api/moodle/upload`;

        setProgress(`Downloading files... (0/${fileJobs.length})`);
        const dlResult = await runDownloadJobs(
          fileJobs,
          authToken,
          uploadEndpoint,
        );
        downloaded = dlResult.downloaded;
        failed = dlResult.failed;
        cancelled = dlResult.cancelled;
        errors.push(...dlResult.errors);
        setFailedJobs(dlResult.failedJobs);
      }

      setSyncedCount(result.syncedCount);
      setDownloadedCount(downloaded);
      setFailedCount(failed);
      if (cancelled) {
        setError(
          `Sync cancelled — ${downloaded} file(s) downloaded before stopping.`,
        );
      } else if (errors.length > 0) {
        setError(`${failed} file(s) failed:\n${errors.join('\n')}`);
      }
      setPhase('done');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sync failed';
      setError(message);
      setAuthError(isAuthError(message));
      setNetworkError(isNetworkError(message) && !isAuthError(message));
      setPermissionError(isPermissionError(message) && !isAuthError(message));
      setPhase('error');
    }
  }

  function cancelPolling() {
    pollCancelRef.current = true;
  }

  // Stop an in-progress scan or download run. The worker pool / scan loop
  // re-checks pollCancelRef before each item, so this halts new work without
  // closing the dialog (closing also cancels, via the open-change effect).
  function cancelSync() {
    pollCancelRef.current = true;
    setProgress('Cancelling…');
  }

  async function handleRetryLogin() {
    // User has (presumably) just logged into Moodle in another tab.
    // Re-run the full handshake from the top.
    await loadCourses();
  }

  async function handleRetryFailed() {
    if (failedJobs.length === 0) return;
    setPhase('syncing');
    // Fresh run — clear any stale cancel flag left by a previous close.
    pollCancelRef.current = false;
    setError(null);
    setProgress(`Retrying ${failedJobs.length} failed file(s)...`);

    // Wrapped so a throw before/around the download run (e.g. getSession
    // failing) lands on the error phase instead of wedging on 'syncing' —
    // whose only footer button is a now-useless Cancel.
    try {
      const {
        data: { session },
      } = await supabaseRef.current.auth.getSession();
      const authToken = session?.access_token;
      const uploadEndpoint = `${window.location.origin}/api/moodle/upload`;

      const result = await runDownloadJobs(
        failedJobs,
        authToken,
        uploadEndpoint,
      );
      setDownloadedCount((prev) => prev + result.downloaded);
      setFailedCount(result.failed);
      setFailedJobs(result.failedJobs);
      if (result.cancelled) {
        setError(
          `Cancelled — ${result.downloaded} of ${failedJobs.length} retried before stopping.`,
        );
      } else if (result.errors.length > 0) {
        setError(
          `${result.failed} file(s) still failed:\n${result.errors.join('\n')}`,
        );
      } else {
        setError(null);
      }
      setPhase('done');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Retry failed';
      setError(message);
      setAuthError(isAuthError(message));
      setNetworkError(isNetworkError(message) && !isAuthError(message));
      setPermissionError(isPermissionError(message) && !isAuthError(message));
      setPhase('error');
    }
  }

  // ---- Render ----
  const totalItems = coursesWithContent.reduce(
    (sum, c) => sum + c.sections.reduce((s2, s) => s2 + s.items.length, 0),
    0,
  );
  const selectedItemCount =
    phase === 'select-content' ? getSelectedItemCount() : 0;

  // Phases where work is actively running. While busy we block accidental
  // dismissal (clicking the backdrop or pressing Esc) so a stray click can't
  // silently cancel an in-progress sync/scan. The explicit Cancel button and
  // the X still close it — this only stops *accidental* dismissal.
  const isBusy =
    phase === 'scraping' ||
    phase === 'comparing' ||
    phase === 'scraping-content' ||
    phase === 'syncing';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-2xl"
        style={{
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        onInteractOutside={(e) => {
          if (isBusy) e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (isBusy) e.preventDefault();
        }}
      >
        <DialogHeader style={{ flexShrink: 0 }}>
          <DialogTitle>
            {phase === 'select-content'
              ? 'Select Materials to Sync'
              : 'Sync Moodle Courses'}
          </DialogTitle>
          <DialogDescription>
            {phase === 'select-content'
              ? `Choose which files and sections to import (${selectedItemCount}/${totalItems} selected)`
              : `Select courses from ${moodleConnection.domain}`}
          </DialogDescription>
        </DialogHeader>

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          {/* Loading phases */}
          {(phase === 'scraping' ||
            phase === 'comparing' ||
            phase === 'scraping-content' ||
            phase === 'syncing') && (
            <div className="flex items-center justify-center py-8">
              <p className="text-sm text-muted-foreground">
                {phase === 'scraping' && 'Scanning Moodle for courses...'}
                {phase === 'comparing' && 'Checking course status...'}
                {phase === 'scraping-content' && progress}
                {phase === 'syncing' && progress}
              </p>
            </div>
          )}

          {/* Awaiting permission grant via popup */}
          {phase === 'awaiting-permission' && (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                <Puzzle className="h-5 w-5 text-primary" />
              </div>
              <p className="text-sm font-medium">
                Approve access to{' '}
                <span className="font-mono">{moodleConnection.domain}</span>
              </p>
              <p className="max-w-xs text-xs text-muted-foreground">
                A Typenote popup opened in your toolbar. Click{' '}
                <strong>Allow</strong> there to continue. If you don&rsquo;t see
                it, click the Typenote icon in the Chrome toolbar.
              </p>
              <p className="text-xs text-muted-foreground">
                Waiting for permission&hellip;
              </p>
            </div>
          )}

          {/* Awaiting Moodle login */}
          {phase === 'awaiting-login' && (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <p className="text-sm font-medium">
                You&rsquo;re not logged in to Moodle
              </p>
              <p className="max-w-xs text-xs text-muted-foreground">
                Open Moodle in a new tab, sign in, then click Retry below.
              </p>
              <a
                href={`https://${moodleConnection.domain}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs underline"
              >
                Open {moodleConnection.domain}
              </a>
            </div>
          )}

          {/* Phase 1: Course selection */}
          {phase === 'select-courses' && courses.length === 0 && (
            <div className="flex items-center justify-center py-8">
              <p className="text-sm text-muted-foreground">
                No courses found on Moodle.
              </p>
            </div>
          )}

          {phase === 'select-courses' && courses.length > 0 && (
            <div className="space-y-2">
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setSelectedCourseIds(
                      new Set(courses.map((c) => c.moodleCourseId)),
                    )
                  }
                >
                  Select All
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedCourseIds(new Set())}
                >
                  Deselect All
                </Button>
              </div>
              {courses.map((course) => {
                const badgeInfo = STATUS_BADGE_MAP[course.status];
                const badgeLabel =
                  course.status === 'synced_by_user' && course.syncedFileCount
                    ? `${course.syncedFileCount} files synced`
                    : badgeInfo.label;
                return (
                  <label
                    key={course.moodleCourseId}
                    className="flex cursor-pointer items-center gap-3 rounded-md border p-3 hover:bg-accent/50"
                  >
                    <Checkbox
                      checked={selectedCourseIds.has(course.moodleCourseId)}
                      onCheckedChange={() =>
                        toggleCourse(course.moodleCourseId)
                      }
                      aria-label={`Select ${course.name}`}
                    />
                    <span className="flex-1 text-sm font-medium">
                      {course.name}
                    </span>
                    <Badge variant={badgeInfo.variant}>{badgeLabel}</Badge>
                  </label>
                );
              })}
            </div>
          )}

          {/* Phase 2: Content selection */}
          {phase === 'select-content' && (
            <div className="space-y-4">
              {/* Select all / Deselect all */}
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={selectAll}>
                  Select All
                </Button>
                <Button variant="outline" size="sm" onClick={deselectAll}>
                  Deselect All
                </Button>
              </div>

              {coursesWithContent.map((course) => {
                const sectionsWithItems = course.sections.filter(
                  (s) => s.items.length > 0,
                );
                return (
                  <div
                    key={course.moodleCourseId}
                    className="rounded-lg border"
                  >
                    {/* Course header */}
                    <div className="flex items-center gap-2 border-b bg-muted/40 px-4 py-2.5">
                      <h4 className="flex-1 text-sm font-semibold">
                        {course.name}
                      </h4>
                      {course.status === 'synced_by_user' && (
                        <Badge variant="outline" className="text-xs">
                          Previously Synced
                        </Badge>
                      )}
                    </div>

                    {sectionsWithItems.length === 0 && (
                      <p className="px-4 py-3 text-xs text-muted-foreground">
                        No materials found
                      </p>
                    )}

                    {/* Sections */}
                    <div className="divide-y">
                      {sectionsWithItems.map((section) => {
                        const sk = sectionKey(
                          course.moodleCourseId,
                          section.moodleSectionId,
                        );
                        const isCollapsed = collapsedSections.has(sk);
                        const sectionSelected = isSectionSelected(
                          course.moodleCourseId,
                          section.moodleSectionId,
                        );
                        const selectedInSection = section.items.filter((item) =>
                          isItemSelected(
                            course.moodleCourseId,
                            section.moodleSectionId,
                            item.moodleUrl,
                          ),
                        ).length;
                        const syncedInSection = section.items.filter((item) =>
                          alreadySyncedUrls.has(item.moodleUrl),
                        ).length;

                        return (
                          <div key={sk}>
                            {/* Section header */}
                            <div className="flex items-center gap-2 px-3 py-2 bg-muted/20">
                              <Checkbox
                                checked={sectionSelected}
                                onCheckedChange={() =>
                                  toggleSection(
                                    course.moodleCourseId,
                                    section.moodleSectionId,
                                  )
                                }
                                aria-label={`Select section ${section.title}`}
                              />
                              <button
                                type="button"
                                className="flex-1 text-left text-xs font-medium hover:underline"
                                onClick={() =>
                                  toggleCollapse(
                                    course.moodleCourseId,
                                    section.moodleSectionId,
                                  )
                                }
                              >
                                {section.title}
                              </button>
                              <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                                {sectionSelected ? `${selectedInSection}/` : ''}
                                {section.items.length}
                                {syncedInSection > 0 &&
                                  ` (${syncedInSection} synced)`}
                              </span>
                              <button
                                type="button"
                                className="text-xs text-muted-foreground hover:text-foreground px-1"
                                onClick={() =>
                                  toggleCollapse(
                                    course.moodleCourseId,
                                    section.moodleSectionId,
                                  )
                                }
                              >
                                {isCollapsed ? '▸' : '▾'}
                              </button>
                            </div>

                            {/* Items */}
                            {!isCollapsed && (
                              <div className="divide-y border-t">
                                {section.items.map((item) => {
                                  const selected = isItemSelected(
                                    course.moodleCourseId,
                                    section.moodleSectionId,
                                    item.moodleUrl,
                                  );
                                  const isSynced = alreadySyncedUrls.has(
                                    item.moodleUrl,
                                  );
                                  return (
                                    <label
                                      key={item.moodleUrl}
                                      className={`flex cursor-pointer items-center gap-2 px-4 py-1.5 hover:bg-accent/30 ${isSynced ? 'opacity-50' : ''}`}
                                    >
                                      <Checkbox
                                        checked={selected}
                                        onCheckedChange={() =>
                                          toggleItem(
                                            course.moodleCourseId,
                                            section.moodleSectionId,
                                            item.moodleUrl,
                                          )
                                        }
                                        aria-label={`Select ${item.name}`}
                                      />
                                      <span className="flex-1 text-xs truncate">
                                        {item.name}
                                      </span>
                                      {isSynced && (
                                        <Badge
                                          variant="secondary"
                                          className="text-[10px] px-1.5 py-0"
                                        >
                                          synced
                                        </Badge>
                                      )}
                                      <Badge
                                        variant="outline"
                                        className="text-[10px] px-1.5 py-0"
                                      >
                                        {item.type === 'file'
                                          ? friendlyFileLabel(item.mimeType)
                                          : 'link'}
                                      </Badge>
                                    </label>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Done phase */}
          {phase === 'done' && (
            <div className="flex flex-col items-center gap-2 py-8">
              <p className="text-sm font-medium">
                {failedCount > 0 && downloadedCount === 0
                  ? `Sync failed — ${failedCount} ${failedCount === 1 ? 'file' : 'files'} could not be downloaded`
                  : failedCount > 0
                    ? `Synced with errors — ${downloadedCount} downloaded, ${failedCount} failed`
                    : `Successfully synced ${syncedCount} ${syncedCount === 1 ? 'course' : 'courses'}`}
              </p>
              <p className="text-xs text-muted-foreground">
                {downloadedCount > 0
                  ? `${downloadedCount} ${downloadedCount === 1 ? 'file' : 'files'} downloaded and stored.`
                  : totalFileJobs > 0
                    ? `${totalFileJobs} files queued but none downloaded.`
                    : 'No downloadable files found (only links).'}
                {failedCount > 0 && ` ${failedCount} failed.`}
              </p>
            </div>
          )}

          {/* Error */}
          {error && phase !== 'select-content' && (
            <div className="space-y-2">
              <p
                className="text-sm text-destructive whitespace-pre-wrap"
                role="alert"
              >
                {networkError && !authError
                  ? `Couldn't reach ${moodleConnection.domain}. Check your internet and try again.`
                  : error}
              </p>
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
              {permissionError && (
                <p className="text-xs text-muted-foreground">
                  Two things to check: (1) you&rsquo;re signed in to{' '}
                  <a
                    href={`https://${moodleConnection.domain}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline"
                  >
                    {moodleConnection.domain}
                  </a>{' '}
                  (open it in a new tab and confirm), and (2) the extension has
                  permission for that host. Then click <strong>Retry</strong>{' '}
                  below.
                </p>
              )}
              {noCoursesError && (
                <p className="text-xs text-muted-foreground">
                  Open{' '}
                  <a
                    href={`https://${moodleConnection.domain}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline"
                  >
                    {moodleConnection.domain}
                  </a>{' '}
                  in a tab, make sure you&rsquo;re signed in and your courses
                  show on the <strong>My Courses</strong> page, then click{' '}
                  <strong>Retry</strong>.
                </p>
              )}
              {debugInfo && (
                <details className="text-xs text-muted-foreground">
                  <summary className="cursor-pointer">Debug info</summary>
                  <pre className="mt-1 whitespace-pre-wrap">{debugInfo}</pre>
                </details>
              )}
            </div>
          )}
        </div>

        <DialogFooter style={{ flexShrink: 0 }}>
          {phase === 'select-courses' && courses.length > 0 && (
            <Button
              onClick={handlePreviewContent}
              disabled={selectedCourseIds.size === 0}
            >
              Preview Content ({selectedCourseIds.size})
            </Button>
          )}
          {phase === 'select-content' && (
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setPhase('select-courses')}
              >
                Back
              </Button>
              <Button onClick={handleSync} disabled={selectedItemCount === 0}>
                Sync Selected ({selectedItemCount})
              </Button>
            </div>
          )}
          {phase === 'done' && (
            <div className="flex gap-2">
              {failedJobs.length > 0 && (
                <Button variant="outline" onClick={handleRetryFailed}>
                  Retry failed ({failedJobs.length})
                </Button>
              )}
              <Button onClick={() => onOpenChange(false)}>Close</Button>
            </div>
          )}
          {phase === 'error' && (
            <Button variant="outline" onClick={loadCourses}>
              Retry
            </Button>
          )}
          {(phase === 'syncing' || phase === 'scraping-content') && (
            <Button variant="outline" onClick={cancelSync}>
              Cancel
            </Button>
          )}
          {phase === 'awaiting-permission' && (
            <Button
              variant="outline"
              onClick={() => {
                cancelPolling();
                setPhase('error');
                setError('Permission grant was cancelled.');
              }}
            >
              Cancel
            </Button>
          )}
          {phase === 'awaiting-login' && (
            <Button variant="outline" onClick={handleRetryLogin}>
              Retry
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
