'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useMoodleExtension } from '@/hooks/use-moodle-extension';
import { recordFileImports } from '@/lib/actions/moodle-sync';
import type { CourseStatusPayload } from '@/lib/moodle/types';

/** A single file/link item returned by the scraper */
export interface ScrapedItem {
  type: 'file' | 'link';
  name: string;
  moodleUrl: string;
  externalUrl?: string;
  fileSize?: number;
  mimeType?: string;
}

/** A section (week/topic) returned by the scraper */
export interface ScrapedSection {
  moodleSectionId: string;
  title: string;
  position: number;
  items: ScrapedItem[];
}

interface MoodleFilePickerProps {
  moodleCourseId: string;
  moodleCourseMoodleId: string;
  courseUrl: string;
  instanceDomain: string;
  onImportComplete: () => void;
}

type PickerPhase =
  | 'loading'
  | 'ready'
  | 'importing'
  | 'done'
  | 'error';

/** Format bytes into a human-readable size string */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function MoodleFilePicker({
  moodleCourseId,
  moodleCourseMoodleId,
  courseUrl,
  instanceDomain,
  onImportComplete,
}: MoodleFilePickerProps) {
  const { scrapeCourseContent, downloadAndUpload } = useMoodleExtension();

  const [phase, setPhase] = useState<PickerPhase>('loading');
  const [sections, setSections] = useState<ScrapedSection[]>([]);
  const [importedFileIds, setImportedFileIds] = useState<Set<string>>(new Set());
  const [selectedUrls, setSelectedUrls] = useState<Set<string>>(new Set());
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [importProgress, setImportProgress] = useState<string | null>(null);
  const [importedCount, setImportedCount] = useState(0);

  /** Build a stable key for each item based on section + url */
  const itemKey = useCallback(
    (sectionId: string, moodleUrl: string) => `${sectionId}::${moodleUrl}`,
    [],
  );

  const loadContent = useCallback(async () => {
    setPhase('loading');
    setError(null);
    setSections([]);
    setSelectedUrls(new Set());

    try {
      // Fetch scraped content and import status in parallel
      const [scrapeResult, statusResponse] = await Promise.all([
        scrapeCourseContent(courseUrl),
        fetch(`/api/moodle/status?moodleCourseId=${encodeURIComponent(moodleCourseId)}`),
      ]);

      // Parse status response
      let status: CourseStatusPayload = {
        lastSyncedAt: null,
        importedFileIds: [],
        removedFileIds: [],
      };
      if (statusResponse.ok) {
        status = await statusResponse.json();
      }

      const alreadyImported = new Set(status.importedFileIds);
      setImportedFileIds(alreadyImported);

      const scrapedSections = scrapeResult?.sections ?? [];
      setSections(scrapedSections);

      // Expand all sections by default
      setExpandedSections(new Set(scrapedSections.map((s) => s.moodleSectionId)));

      // Pre-select items that are NOT already imported
      const preSelected = new Set<string>();
      for (const section of scrapedSections) {
        for (const item of section.items) {
          const key = itemKey(section.moodleSectionId, item.moodleUrl);
          // We don't have file registry IDs from scraping, so we can't
          // check importedFileIds directly. Items are considered "imported"
          // only if their moodleUrl matches one already tracked.
          // For now, we select all items — the status API returns file IDs
          // not URLs, so matching happens post-registry-sync.
          if (!alreadyImported.has(key)) {
            preSelected.add(key);
          }
        }
      }
      setSelectedUrls(preSelected);
      setPhase('ready');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load course content');
      setPhase('error');
    }
  }, [scrapeCourseContent, courseUrl, moodleCourseId, itemKey]);

  useEffect(() => {
    loadContent();
  }, [loadContent]);

  function toggleItem(sectionId: string, moodleUrl: string) {
    const key = itemKey(sectionId, moodleUrl);
    setSelectedUrls((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  function toggleSection(sectionId: string) {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  }

  async function handleImport() {
    setPhase('importing');
    setError(null);
    setImportProgress('Preparing import...');

    try {
      // Gather selected items
      const selectedItems: Array<{
        sectionId: string;
        moodleUrl: string;
        fileName: string;
      }> = [];

      for (const section of sections) {
        for (const item of section.items) {
          const key = itemKey(section.moodleSectionId, item.moodleUrl);
          if (selectedUrls.has(key)) {
            selectedItems.push({
              sectionId: section.moodleSectionId,
              moodleUrl: item.moodleUrl,
              fileName: item.name,
            });
          }
        }
      }

      if (selectedItems.length === 0) return;

      // Step 1: For each file, call the extension to download and upload
      const uploadEndpoint = `${window.location.origin}/api/moodle/upload`;
      const completedFileIds: string[] = [];
      let completed = 0;

      for (const item of selectedItems) {
        completed++;
        setImportProgress(
          `Downloading file ${completed}/${selectedItems.length}: ${item.fileName}`,
        );

        const result = await downloadAndUpload({
          moodleFileUrl: item.moodleUrl,
          uploadEndpoint,
          metadata: {
            sectionId: item.sectionId,
            moodleUrl: item.moodleUrl,
            fileName: item.fileName,
          },
        });

        // The stub returns null (not yet implemented), so we handle gracefully
        if (result) {
          // In future, result would contain the file ID
          // For now, we collect what we can
        }
      }

      // Step 2: Record the imports server-side
      setImportProgress('Recording imports...');

      // Since the extension stub doesn't return file IDs yet,
      // we pass whatever IDs we have. When the extension is implemented,
      // downloadAndUpload will return file registry IDs.
      const importResult = await recordFileImports(
        moodleCourseId,
        completedFileIds,
      );

      setImportedCount(importResult.importedCount);
      setPhase('done');
      onImportComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
      setPhase('error');
    }
  }

  const totalItems = sections.reduce((sum, s) => sum + s.items.length, 0);

  return (
    <div className="space-y-3" data-testid="file-picker">
      {/* Loading state */}
      {phase === 'loading' && (
        <div className="flex items-center justify-center py-6">
          <p className="text-sm text-muted-foreground">
            Scanning course content...
          </p>
        </div>
      )}

      {/* Empty state */}
      {phase === 'ready' && sections.length === 0 && (
        <div className="flex items-center justify-center py-6">
          <p className="text-sm text-muted-foreground">
            No files found in this course.
          </p>
        </div>
      )}

      {/* Section list */}
      {phase === 'ready' && sections.length > 0 && (
        <>
          <div className="space-y-2">
            {sections
              .sort((a, b) => a.position - b.position)
              .map((section) => {
                const isExpanded = expandedSections.has(section.moodleSectionId);
                const sectionSelectedCount = section.items.filter((item) =>
                  selectedUrls.has(itemKey(section.moodleSectionId, item.moodleUrl)),
                ).length;

                return (
                  <div
                    key={section.moodleSectionId}
                    className="rounded-md border"
                  >
                    {/* Section header */}
                    <button
                      type="button"
                      className="flex w-full items-center justify-between p-3 text-left hover:bg-accent/50"
                      onClick={() => toggleSection(section.moodleSectionId)}
                      aria-expanded={isExpanded}
                      aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${section.title}`}
                    >
                      <span className="text-sm font-medium">
                        {section.title}
                      </span>
                      <span className="flex items-center gap-2">
                        {sectionSelectedCount > 0 && (
                          <Badge variant="secondary">
                            {sectionSelectedCount} selected
                          </Badge>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {section.items.length}{' '}
                          {section.items.length === 1 ? 'item' : 'items'}
                        </span>
                        <span className="text-muted-foreground">
                          {isExpanded ? '\u25B2' : '\u25BC'}
                        </span>
                      </span>
                    </button>

                    {/* Section items */}
                    {isExpanded && section.items.length > 0 && (
                      <>
                        <Separator />
                        <div className="space-y-1 p-2">
                          {section.items.map((item) => {
                            const key = itemKey(
                              section.moodleSectionId,
                              item.moodleUrl,
                            );
                            const isImported = importedFileIds.has(key);
                            const isSelected = selectedUrls.has(key);

                            return (
                              <label
                                key={item.moodleUrl}
                                className="flex cursor-pointer items-center gap-3 rounded px-2 py-1.5 hover:bg-accent/30"
                              >
                                <Checkbox
                                  checked={isSelected}
                                  onCheckedChange={() =>
                                    toggleItem(
                                      section.moodleSectionId,
                                      item.moodleUrl,
                                    )
                                  }
                                  aria-label={`Select ${item.name}`}
                                />
                                {/* File type icon */}
                                <span
                                  className="text-base"
                                  title={item.type === 'file' ? 'File' : 'Link'}
                                  aria-label={item.type === 'file' ? 'File' : 'Link'}
                                  role="img"
                                >
                                  {item.type === 'file' ? '\uD83D\uDCC4' : '\uD83D\uDD17'}
                                </span>
                                <span className="flex-1 truncate text-sm">
                                  {item.name}
                                </span>
                                {item.fileSize != null && item.fileSize > 0 && (
                                  <span className="text-xs text-muted-foreground">
                                    {formatFileSize(item.fileSize)}
                                  </span>
                                )}
                                {isImported && (
                                  <Badge variant="outline">Already imported</Badge>
                                )}
                              </label>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
          </div>

          <div className="flex items-center justify-between pt-2">
            <p className="text-xs text-muted-foreground">
              {selectedUrls.size} of {totalItems} items selected
            </p>
            <Button
              onClick={handleImport}
              disabled={selectedUrls.size === 0}
              size="sm"
            >
              Import Selected ({selectedUrls.size})
            </Button>
          </div>
        </>
      )}

      {/* Importing phase */}
      {phase === 'importing' && importProgress && (
        <div className="flex items-center justify-center py-6">
          <p className="text-sm text-muted-foreground">{importProgress}</p>
        </div>
      )}

      {/* Done phase */}
      {phase === 'done' && (
        <div className="flex flex-col items-center justify-center gap-2 py-6">
          <p className="text-sm font-medium">
            Import complete ({importedCount}{' '}
            {importedCount === 1 ? 'file' : 'files'} recorded)
          </p>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="space-y-2">
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
          <Button variant="outline" size="sm" onClick={loadContent}>
            Retry
          </Button>
        </div>
      )}
    </div>
  );
}
