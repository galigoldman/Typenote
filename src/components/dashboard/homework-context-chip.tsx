import { BookOpen, Paperclip } from 'lucide-react';
import type { HomeworkContext } from '@/types/database';

/**
 * A compact, read-only strip shown at the top of a homework document so the
 * student can see exactly what the AI is focused on. This is what finally
 * consumes getHomeworkContext() (built in Phase 1, never displayed until now).
 */
export function HomeworkContextChip({ context }: { context: HomeworkContext }) {
  return (
    <div
      data-testid="homework-context"
      className="mx-4 mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs"
    >
      <span className="inline-flex items-center gap-1.5 font-medium text-primary">
        <BookOpen className="size-3.5" />
        Homework: {context.exerciseDocument.title}
      </span>
      {context.materials.length > 0 && (
        <span className="inline-flex flex-wrap items-center gap-1.5 text-muted-foreground">
          <Paperclip className="size-3" />
          {context.materials.map((m) => (
            <span
              key={`${m.type}:${m.id}`}
              className="rounded-full bg-background px-2 py-0.5"
            >
              {m.name}
            </span>
          ))}
        </span>
      )}
      <span className="ml-auto text-muted-foreground/70">
        The AI prioritizes these but still sees all your materials.
      </span>
    </div>
  );
}
