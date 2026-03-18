'use client';

import { useEffect, useState } from 'react';
import { ChevronDown, Copy, Loader2, Plus, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface SplitQuestion {
  id: string;
  label: string;
  position: number;
  boundary_start: number;
  boundary_end: number;
  preamble_start?: number | null;
  preamble_end?: number | null;
  low_confidence: boolean;
}

interface AssignmentSplit {
  id: string;
  creator_type: 'ai' | 'student';
  is_personal: boolean;
  content_version: number;
  created_at: string;
  split_questions?: SplitQuestion[];
}

interface QuestionBrowserPanelProps {
  assignmentId: string;
  descriptionHtml: string;
  isOpen: boolean;
  onClose: () => void;
  onCopyQuestion: (params: {
    label: string;
    html: string;
    preambleHtml: string | null;
    assignmentId: string;
    splitId: string;
    createNewDoc: boolean;
  }) => void;
}

function splitLabel(split: AssignmentSplit): string {
  if (split.creator_type === 'ai') return 'AI split';
  if (split.is_personal) return 'My split';
  return 'Shared split';
}

export function QuestionBrowserPanel({
  assignmentId,
  descriptionHtml,
  isOpen,
  onClose,
  onCopyQuestion,
}: QuestionBrowserPanelProps) {
  const [splits, setSplits] = useState<AssignmentSplit[]>([]);
  const [selectedSplitId, setSelectedSplitId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;

    async function fetchSplits() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/moodle/assignments/splits?assignmentId=${assignmentId}`,
        );
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? `HTTP ${res.status}`);
        }
        const data = await res.json();
        if (!cancelled) {
          const fetchedSplits: AssignmentSplit[] = data.splits ?? [];
          setSplits(fetchedSplits);
          if (fetchedSplits.length > 0) {
            setSelectedSplitId((prev) => {
              // Keep the current selection if still valid
              if (prev && fetchedSplits.some((s) => s.id === prev)) return prev;
              return fetchedSplits[0].id;
            });
          } else {
            setSelectedSplitId(null);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : 'Failed to load splits',
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchSplits();

    return () => {
      cancelled = true;
    };
  }, [isOpen, assignmentId]);

  if (!isOpen) return null;

  const selectedSplit = splits.find((s) => s.id === selectedSplitId) ?? null;
  const latestVersion = splits.reduce(
    (max, s) => Math.max(max, s.content_version),
    0,
  );

  const questions: SplitQuestion[] = (
    (selectedSplit as any)?.split_questions ?? []
  )
    .slice()
    .sort((a: SplitQuestion, b: SplitQuestion) => a.position - b.position);

  function extractHtml(start: number, end: number): string {
    return descriptionHtml.slice(start, end);
  }

  function handleCopy(question: SplitQuestion, createNewDoc: boolean) {
    if (!selectedSplit) return;

    const html = extractHtml(question.boundary_start, question.boundary_end);
    const preambleHtml =
      question.preamble_start != null && question.preamble_end != null
        ? extractHtml(question.preamble_start, question.preamble_end)
        : null;

    onCopyQuestion({
      label: question.label,
      html,
      preambleHtml,
      assignmentId,
      splitId: selectedSplit.id,
      createNewDoc,
    });
  }

  const isStale =
    selectedSplit != null &&
    selectedSplit.content_version < latestVersion;

  return (
    <div className="fixed inset-0 z-50 flex h-full w-full flex-col border-l bg-background shadow-xl md:inset-auto md:right-0 md:top-0 md:h-full md:w-[420px]">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <span className="font-semibold">Questions</span>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="h-8 w-8 min-h-[44px] min-w-[44px]"
          aria-label="Close question browser"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Split selector */}
      {splits.length > 0 && (
        <div className="border-b px-4 py-2">
          <div className="relative">
            <select
              value={selectedSplitId ?? ''}
              onChange={(e) => setSelectedSplitId(e.target.value)}
              className="w-full appearance-none rounded-lg border bg-background px-3 py-2 pr-8 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Select split"
            >
              {splits.map((split) => (
                <option key={split.id} value={split.id}>
                  {splitLabel(split)}
                  {split.content_version < latestVersion
                    ? ' (older version)'
                    : ''}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          </div>
          {isStale && (
            <p className="mt-1.5 text-xs text-amber-500">
              This split is based on an older version of the assignment.
            </p>
          )}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading questions...
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        ) : splits.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-sm font-medium text-muted-foreground">
              No question splits available yet.
            </p>
            <p className="mt-1 text-xs text-muted-foreground/60">
              The AI is still processing this assignment.
            </p>
          </div>
        ) : questions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-sm text-muted-foreground">
              No questions found in this split.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {questions.map((question) => {
              const preview = extractHtml(
                question.boundary_start,
                question.boundary_end,
              )
                .replace(/<[^>]+>/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();

              return (
                <li
                  key={question.id}
                  className="rounded-lg border bg-card p-3 text-card-foreground"
                >
                  <div className="mb-1.5 flex items-center gap-2">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Question {question.label}
                    </span>
                    {question.low_confidence && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                        Low confidence
                      </span>
                    )}
                  </div>
                  <p className="mb-3 line-clamp-3 text-sm text-foreground/80">
                    {preview}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 gap-1.5 text-xs"
                      onClick={() => handleCopy(question, false)}
                    >
                      <Copy className="h-3 w-3" />
                      Copy to document
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 gap-1.5 text-xs"
                      onClick={() => handleCopy(question, true)}
                    >
                      <Plus className="h-3 w-3" />
                      New document
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
