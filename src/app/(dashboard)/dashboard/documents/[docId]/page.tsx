import Link from 'next/link';
import { redirect } from 'next/navigation';
import { GraduationCap } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { AiChatWrapper } from '@/components/ai/ai-chat-wrapper';
import { DocumentWithAi } from '@/components/ai/document-with-ai';
import { TiptapEditorWithVersions } from '@/components/editor/tiptap-editor-with-versions';
import type { Course, CourseWeek, Document } from '@/types/database';

interface DocumentPageProps {
  params: Promise<{ docId: string }>;
}

export default async function DocumentPage({ params }: DocumentPageProps) {
  const { docId } = await params;
  const supabase = await createClient();

  const { data: document, error } = await supabase
    .from('documents')
    .select('*')
    .eq('id', docId)
    .single();

  if (error || !document) {
    redirect('/dashboard');
  }

  const typedDocument = document as Document;

  let course: Course | null = null;
  let week: CourseWeek | null = null;

  if (typedDocument.course_id) {
    const { data: courseData } = await supabase
      .from('courses')
      .select('*')
      .eq('id', typedDocument.course_id)
      .single();
    course = courseData as Course | null;

    if (typedDocument.week_id) {
      const { data: weekData } = await supabase
        .from('course_weeks')
        .select('*')
        .eq('id', typedDocument.week_id)
        .single();
      week = weekData as CourseWeek | null;
    }
  }

  // Text-only document (e.g. imported .docx) — use TipTap editor directly
  const isTextDocument = !typedDocument.pages && !typedDocument.material_id;
  const weekLabel = week ? `Week ${week.week_number}` : undefined;

  return (
    <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
      {/* Course breadcrumb (desktop only) */}
      {course && (
        <div className="flex pointer-touch:hidden items-center justify-between px-4 pt-2">
          <Link
            href={`/dashboard/courses/${course.id}`}
            className="mb-2 inline-flex items-center gap-1 uppercase text-xs tracking-wider font-semibold bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 rounded-full px-3 py-1 hover:bg-green-200 dark:hover:bg-green-800 transition-colors min-h-[44px]"
          >
            <GraduationCap className="size-3.5" />
            {course.name}
          </Link>
        </div>
      )}

      {isTextDocument ? (
        <TiptapEditorWithVersions
          document={typedDocument}
          courseId={course?.id}
          courseName={course?.name}
          weekId={typedDocument.week_id ?? undefined}
          weekLabel={weekLabel}
        />
      ) : (
        <DocumentWithAi
          courseId={course?.id}
          courseName={course?.name}
          weekId={typedDocument.week_id ?? undefined}
          weekLabel={weekLabel}
          document={typedDocument}
          materialId={typedDocument.material_id}
          personalFileId={typedDocument.personal_file_id}
        />
      )}
    </div>
  );
}
