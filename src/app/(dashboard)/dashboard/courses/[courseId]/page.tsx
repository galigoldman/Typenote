import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { DocumentCard } from '@/components/dashboard/document-card';
import { CreateDocumentDialog } from '@/components/dashboard/create-document-dialog';
import { WeekSection } from '@/components/dashboard/week-section';
import { WeekDialog } from '@/components/dashboard/week-dialog';
import { EmptyState } from '@/components/dashboard/empty-state';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import type {
  Course,
  CourseWeek,
  CourseMaterial,
  Document,
} from '@/types/database';

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

  // Split documents: course-level (no week) vs week-level
  const courseDocuments = typedDocuments.filter((d) => !d.week_id);
  const weekDocuments = typedDocuments.filter((d) => d.week_id);

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

  // Fetch linked Moodle data (if this course was created from a Moodle sync)
  const admin = createAdminClient();
  const { data: syncRecord } = await admin
    .from('user_course_syncs')
    .select('moodle_course_id')
    .eq('user_id', user?.id ?? '')
    .eq('course_id', courseId)
    .single();

  type MoodleFileRow = {
    id: string;
    file_name: string;
    type: string;
    moodle_url: string;
    storage_path: string | null;
    mime_type: string | null;
    file_size: number | null;
    position: number;
    downloadUrl?: string;
  };
  type MoodleSectionWithFiles = {
    id: string;
    title: string;
    position: number;
    moodle_files: MoodleFileRow[];
  };

  let moodleSections: MoodleSectionWithFiles[] = [];
  if (syncRecord) {
    const { data: sections } = await admin
      .from('moodle_sections')
      .select('id, title, position, moodle_files(id, file_name, type, moodle_url, storage_path, mime_type, file_size, position)')
      .eq('course_id', syncRecord.moodle_course_id)
      .order('position');
    const rawSections = ((sections ?? []) as MoodleSectionWithFiles[])
      .filter((s) => s.moodle_files.length > 0);

    // Generate signed download URLs for files stored in Supabase Storage
    for (const section of rawSections) {
      for (const file of section.moodle_files) {
        if (file.storage_path) {
          const { data: signedUrl } = await admin.storage
            .from('moodle-materials')
            .createSignedUrl(file.storage_path, 3600); // 1 hour
          file.downloadUrl = signedUrl?.signedUrl ?? undefined;
        }
      }
    }
    moodleSections = rawSections;
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

  const isEmpty = typedWeeks.length === 0 && courseDocuments.length === 0 && moodleSections.length === 0;

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
          {/* Course-level documents (not assigned to a week) */}
          {courseDocuments.length > 0 && (
            <div className="mb-6">
              <h2 className="mb-3 text-sm font-medium text-muted-foreground">
                Documents
              </h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                {courseDocuments.map((doc) => (
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
                    documents={weekDocuments.filter(
                      (d) => d.week_id === week.id,
                    )}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Moodle materials */}
          {moodleSections.length > 0 && (
            <div className="mt-6">
              <h2 className="mb-3 text-sm font-medium text-muted-foreground">
                Moodle Materials
              </h2>
              <div className="space-y-3">
                {moodleSections.map((section) => (
                  <div key={section.id} className="rounded-lg border">
                    <div className="border-b bg-muted/30 px-4 py-2">
                      <h3 className="text-sm font-medium">{section.title}</h3>
                    </div>
                    <div className="divide-y">
                      {section.moodle_files
                        .sort((a, b) => a.position - b.position)
                        .map((file) => {
                          const href = file.downloadUrl ?? file.moodle_url;
                          const isStored = !!file.downloadUrl;
                          return (
                            <a
                              key={file.id}
                              href={href}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-3 px-4 py-2 hover:bg-accent/30 transition-colors"
                              {...(isStored ? { download: file.file_name } : {})}
                            >
                              <span className="flex-1 text-sm truncate">{file.file_name}</span>
                              {file.file_size && (
                                <span className="text-xs text-muted-foreground shrink-0">
                                  {file.file_size > 1024 * 1024
                                    ? `${(file.file_size / (1024 * 1024)).toFixed(1)} MB`
                                    : `${Math.round(file.file_size / 1024)} KB`}
                                </span>
                              )}
                              <Badge variant="outline" className="text-xs shrink-0">
                                {file.type === 'file'
                                  ? (file.mime_type?.split('/')[1] ?? 'file')
                                  : 'link'}
                              </Badge>
                            </a>
                          );
                        })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
