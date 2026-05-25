'use client';
import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import {
  getMoodleMaterialsForCourse,
  type MoodleSectionDto,
} from '@/lib/actions/moodle-materials';
import { MoodleFileRow } from './moodle-file-row';

export function MoodleMaterialsSection({ courseId }: { courseId: string }) {
  const [open, setOpen] = useState(false);
  const [sections, setSections] = useState<MoodleSectionDto[] | null>(null);
  const [loading, setLoading] = useState(false);
  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && sections === null && !loading) {
      setLoading(true);
      try {
        setSections(await getMoodleMaterialsForCourse(courseId));
      } finally {
        setLoading(false);
      }
    }
  }
  return (
    <div className="mt-6">
      <button
        onClick={toggle}
        className="mb-3 flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ChevronRight
          className={`size-3.5 transition-transform ${open ? 'rotate-90' : ''}`}
        />{' '}
        Moodle Materials
      </button>
      {open && (
        <div className="space-y-3">
          {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {sections?.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No imported Moodle files.
            </p>
          )}
          {sections?.map((section) => (
            <div key={section.id} className="rounded-lg border">
              <div className="border-b bg-muted/30 px-4 py-2">
                <h3 className="text-sm font-medium">{section.title}</h3>
              </div>
              <div className="divide-y">
                {section.files.map((f) => (
                  <MoodleFileRow
                    key={f.id}
                    fileId={f.id}
                    fileName={f.file_name}
                    fileType={f.type}
                    mimeType={f.mime_type}
                    fileSize={f.file_size}
                    href={f.href}
                    isStored={f.isStored}
                    courseId={courseId}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
