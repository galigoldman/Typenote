'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { leaveCourse } from '@/lib/actions/course-sharing';

export function LeaveCourseMenuItem({ courseId }: { courseId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <DropdownMenuItem
      className="text-destructive"
      disabled={busy}
      onSelect={async (e) => {
        e.preventDefault();
        if (
          !window.confirm(
            'Remove this course from your list? This deletes the files you added to it. Your own notes are kept (moved to your home).',
          )
        )
          return;
        setBusy(true);
        try {
          await leaveCourse(courseId);
          toast.success('Removed from your list');
          router.refresh();
        } catch (err) {
          toast.error(err instanceof Error ? err.message : 'Failed to remove');
        } finally {
          setBusy(false);
        }
      }}
    >
      Remove from my list
    </DropdownMenuItem>
  );
}
