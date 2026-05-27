'use client';

import { useState } from 'react';
import { Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ShareCourseDialog } from './share-course-dialog';

export function ShareCourseButton({ courseId }: { courseId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Share2 className="mr-2 size-4" />
        Share
      </Button>
      <ShareCourseDialog
        courseId={courseId}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}
