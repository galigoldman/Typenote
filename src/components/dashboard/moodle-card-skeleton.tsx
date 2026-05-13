import { Card, CardContent, CardHeader } from '@/components/ui/card';

/**
 * Placeholder card rendered while the extension PING is in flight (≤2 s).
 * Empty text content — the visual interest comes entirely from animated pulse blocks.
 */
export function MoodleCardSkeleton() {
  return (
    <Card aria-busy="true" aria-label="Loading Moodle integration">
      <CardHeader>
        <div className="h-4 w-40 animate-pulse rounded bg-muted" />
        <div className="mt-2 h-3 w-64 animate-pulse rounded bg-muted" />
      </CardHeader>
      <CardContent>
        <div className="h-8 w-28 animate-pulse rounded bg-muted" />
      </CardContent>
    </Card>
  );
}
