import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { DocumentCard } from '@/components/dashboard/document-card';
import { CreateDocumentDialog } from '@/components/dashboard/create-document-dialog';
import { WeekSection } from '@/components/dashboard/week-section';
import { WeekDialog } from '@/components/dashboard/week-dialog';
import { EmptyState } from '@/components/dashboard/empty-state';
import { Button } from '@/components/ui/button';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import type { Course, CourseWeek, CourseMaterial, Document } from '@/types/database';

export default async function CoursePage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
  const supabase = await createClient();

  // Get authenticated user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Fetch course
  const { data: course } = await supabase
    .from('courses')
    .select('*')
    .eq('id', courseId)
    .single();

  if (!course) {
    notFound();
  }

  const typedCourse = course as Course;

  // Fetch weeks
  const { data: weeks } = await supabase
    .from('course_weeks')
    .select('*')
    .eq('course_id', courseId)
    .order('week_number', { ascending: true });

  // Fetch documents for this course
  const { data: documents } = await supabase
    .from('documents')
    .select('*')
    .eq('course_id', courseId)
    .order('position', { ascending: true });

  const typedWeeks = (weeks as CourseWeek[] | null) ?? [];
  const typedDocuments = (documents as Document[] | null) ?? [];

  // Fetch materials for all weeks
  const weekIds = typedWeeks.map((w) => w.id);
  let allMaterials: CourseMaterial[] = [];
  if (weekIds.length > 0) {
    const { data: materialsData } = await supabase
      .from('course_materials')
      .select('*')
      .in('week_id', weekIds)
      .order('created_at', { ascending: true });
    allMaterials = (materialsData as CourseMaterial[] | null) ?? [];
  }

  // Build breadcrumbs - if course is in a folder, include it
  let parentFolder = null;
  if (typedCourse.folder_id) {
    const { data: folder } = await supabase
      .from('folders')
      .select('*')
      .eq('id', typedCourse.folder_id)
      .single();
    parentFolder = folder;
  }

  const isEmpty = typedWeeks.length === 0 && typedDocuments.length === 0;

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/dashboard">Home</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            {parentFolder && (
              <>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbLink asChild>
                    <Link href={`/dashboard/folders/${parentFolder.id}`}>
                      {parentFolder.name}
                    </Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
              </>
            )}
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{typedCourse.name}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div className="flex items-center gap-2">
          <CreateDocumentDialog folderId={null} courseId={courseId}>
            <Button variant="outline" size="sm">
              New Document
            </Button>
          </CreateDocumentDialog>
          <WeekDialog courseId={courseId} />
        </div>
      </div>

      {/* Course header */}
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">{typedCourse.name}</h1>
        </div>
      </div>

      {isEmpty ? (
        <EmptyState
          title="This course is empty"
          description="Add weeks to organize your materials, or create a document to start taking notes."
        />
      ) : (
        <>
          {/* Documents section */}
          {typedDocuments.length > 0 && (
            <div className="mb-6">
              <h2 className="mb-3 text-sm font-medium text-muted-foreground">
                Documents
              </h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                {typedDocuments.map((doc) => (
                  <DocumentCard key={doc.id} document={doc} />
                ))}
              </div>
            </div>
          )}

          {/* Weeks section */}
          {typedWeeks.length > 0 && (
            <div>
              <h2 className="mb-3 text-sm font-medium text-muted-foreground">
                Weeks
              </h2>
              <div className="space-y-3">
                {typedWeeks.map((week) => (
                  <WeekSection
                    key={week.id}
                    week={week}
                    courseId={courseId}
                    userId={user?.id ?? ''}
                    materials={allMaterials.filter(
                      (m) => m.week_id === week.id && m.category === 'material',
                    )}
                    homework={allMaterials.filter(
                      (m) => m.week_id === week.id && m.category === 'homework',
                    )}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
