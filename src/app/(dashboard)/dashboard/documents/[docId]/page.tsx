import Link from 'next/link';
import { redirect } from 'next/navigation';
import { GraduationCap } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { DocumentWithAi } from '@/components/ai/document-with-ai';
import { CanvasEditor } from '@/components/canvas/canvas-editor';
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

  // No course linked — render editor without AI
  if (!course) {
    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <CanvasEditor
          document={typedDocument}
          materialId={typedDocument.material_id}
        />
      </div>
    );
  }

  const weekLabel = week ? `Week ${week.week_number}` : undefined;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-2">
        <Link
          href={`/dashboard/courses/${course.id}`}
          className="mb-2 inline-flex items-center gap-1 rounded bg-muted px-2 py-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <GraduationCap className="size-3.5" />
          {course.name}
        </Link>
      </div>
      <DocumentWithAi
        courseId={course.id}
        courseName={course.name}
        weekId={typedDocument.week_id ?? undefined}
        weekLabel={weekLabel}
        document={typedDocument}
        materialId={typedDocument.material_id}
      />
    </div>
  );
}
