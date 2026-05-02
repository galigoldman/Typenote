'use client';

import { useCallback, useEffect, useState } from 'react';
import { X, Clock, RotateCcw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { DocumentVersion } from '@/types/database';
import {
  fetchDocumentVersions,
  restoreDocumentVersion,
} from '@/lib/actions/document-versions';

export function formatRelativeTime(
  isoString: string,
  now: Date = new Date(),
): string {
  const date = new Date(isoString);
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  if (diffHours < 24)
    return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const TRIGGER_LABELS: Record<string, string> = {
  idle: 'Auto-saved',
  periodic: 'Auto-saved',
  close: 'Auto-saved',
  before_restore: 'Before restore',
};

interface VersionSidebarProps {
  documentId: string;
  isOpen: boolean;
  onClose: () => void;
  onRestore?: (version: DocumentVersion) => void;
}

export function VersionSidebar({
  documentId,
  isOpen,
  onClose,
  onRestore,
}: VersionSidebarProps) {
  const router = useRouter();
  const [versions, setVersions] = useState<DocumentVersion[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);

  const fetchVersions = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchDocumentVersions(documentId);
      setVersions(data);
    } catch {
      // Silently fail — sidebar just shows empty state
    } finally {
      setLoading(false);
    }
  }, [documentId]);

  useEffect(() => {
    if (isOpen) {
      fetchVersions();
    }
  }, [isOpen, fetchVersions]);

  const handleRestore = useCallback(async () => {
    if (!selectedId) return;
    const version = versions.find((v) => v.id === selectedId);
    if (!version) return;

    setRestoring(true);
    try {
      await restoreDocumentVersion(selectedId);
      onRestore?.(version);
      // Reload with search param so sidebar stays open and shows "Before restore"
      const url = new URL(window.location.href);
      url.searchParams.set('versionHistory', 'open');
      window.location.href = url.toString();
    } catch {
      setRestoring(false);
    }
  }, [selectedId, versions, onRestore, fetchVersions]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex h-full w-full flex-col border-l bg-background shadow-xl lg:static lg:z-auto lg:w-[300px] lg:shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Version History</h2>
        </div>
        <button
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Version list */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
            Loading...
          </div>
        ) : versions.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 px-4 text-center">
            <Clock className="h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              No version history yet.
            </p>
            <p className="text-xs text-muted-foreground/70">
              Versions are saved automatically as you edit.
            </p>
          </div>
        ) : (
          <div className="divide-y">
            {versions.map((version) => (
              <button
                key={version.id}
                onClick={() =>
                  setSelectedId((prev) =>
                    prev === version.id ? null : version.id,
                  )
                }
                className={`w-full px-4 py-3 text-left transition-colors hover:bg-accent/50 ${
                  selectedId === version.id
                    ? 'bg-accent border-l-2 border-l-primary'
                    : ''
                }`}
              >
                <div className="text-sm font-medium">
                  {formatRelativeTime(version.created_at)}
                </div>
                <div className="text-xs text-muted-foreground">
                  {TRIGGER_LABELS[version.trigger] ?? version.trigger}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Restore button */}
      {selectedId && (
        <div className="border-t p-4">
          <button
            onClick={handleRestore}
            disabled={restoring}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            <RotateCcw className="h-4 w-4" />
            {restoring ? 'Restoring...' : 'Restore this version'}
          </button>
        </div>
      )}
    </div>
  );
}
