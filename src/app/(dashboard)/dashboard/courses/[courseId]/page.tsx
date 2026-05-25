import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { AiChatWrapper } from '@/components/ai/ai-chat-wrapper';
import { DocumentListWithMove } from '@/components/dashboard/document-list-with-move';
import { CreateDocumentDialog } from '@/components/dashboard/create-document-dialog';
import { StartHomeworkDialog } from '@/components/dashboard/start-homework-dialog';
import { EmptyState } from '@/components/dashboard/empty-state';
import { PersonalFileUpload } from '@/components/dashboard/personal-file-upload';
import { PersonalFileItem } from '@/components/dashboard/personal-file-item';
import { MaterialItem } from '@/components/dashboard/material-item';
import { MoodleMaterialsSection } from '@/components/dashboard/moodle-materials-section';
import { Button } from '@/components/ui/button';
import { ChevronLeft } from 'lucide-react';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import type { Course, CourseMaterial, Document, PersonalFile } from '@/types/database';

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

  // Fetch course first (need to 404 early if missing)
  const { data: course } = await supabase
    .from('courses')
    .select('*')
    .eq('id', courseId)
    .single();

  if (!course) {
    notFound();
  }

  const typedCourse = course as Course;

  // Parallel fetch: documents, course_materials, personal_files, and folder breadcrumb
  const [documentsResult, materialsResult, personalFilesResult, folderResult] =
    await Promise.all([
      supabase
        .from('documents')
        .select('*')
        .eq('course_id', courseId)
        .order('position', { ascending: true }),
      supabase
        .from('course_materials')
        .select('*')
        .eq('course_id', courseId)
        .order('created_at', { ascending: true }),
      supabase
        .from('personal_files')
        .select('*')
        .eq('course_id', courseId)
        .order('created_at', { ascending: true }),
      typedCourse.folder_id
        ? supabase
            .from('folders')
            .select('*')
            .eq('id', typedCourse.folder_id)
            .single()
        : Promise.resolve({ data: null }),
    ]);

  const typedDocuments = (documentsResult.data as Document[] | null) ?? [];
  const courseMaterials = (materialsResult.data as CourseMaterial[] | null) ?? [];
  const personalFilesRaw = (personalFilesResult.data as PersonalFile[] | null) ?? [];
  const parentFolder = folderResult.data ?? null;

  // Hide personal files that already have a linked document
  // (the document replaces the file in the UI once opened)
  const linkedFileIds = new Set(
    typedDocuments
      .filter((d) => d.personal_file_id)
      .map((d) => d.personal_file_id),
  );
  const personalFiles = personalFilesRaw.filter(
    (f) => !linkedFileIds.has(f.id),
  );

  const isEmpty =
    typedDocuments.length === 0 &&
    courseMaterials.length === 0 &&
    personalFiles.length === 0;

  return (
    <div className="h-full overflow-y-auto p-6">
      <Link
        href="/dashboard"
        className="mb-4 inline-flex items-center gap-1 rounded bg-muted px-2 py-1 text-sm text-muted-foreground hover:text-foreground min-h-[44px]"
      >
        <ChevronLeft className="size-3.5" />
        Dashboard
      </Link>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
        <Breadcrumb className="min-w-0">
          <BreadcrumbList className="flex-wrap">
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
        <div className="flex flex-wrap items-center gap-2">
          <AiChatWrapper courseId={courseId} courseName={typedCourse.name} />
          <StartHomeworkDialog
            courseId={courseId}
            documents={typedDocuments}
            materials={courseMaterials}
            personalFiles={personalFiles}
          >
            <Button variant="outline" size="sm">
              Start Homework
            </Button>
          </StartHomeworkDialog>
          <CreateDocumentDialog folderId={null} courseId={courseId}>
            <Button variant="outline" size="sm">
              New Document
            </Button>
          </CreateDocumentDialog>
          <PersonalFileUpload
            courseId={courseId}
            userId={user?.id ?? ''}
            category="material"
            label="Import File"
          />
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
          description="Import materials or create a document to start."
        />
      ) : (
        <>
          {/* Documents */}
          {typedDocuments.length > 0 && (
            <div className="mb-6">
              <h2 className="mb-3 text-sm font-medium text-muted-foreground">
                Documents
              </h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                <DocumentListWithMove documents={typedDocuments} />
              </div>
            </div>
          )}

          {/* Materials: course_materials + personal_files combined */}
          {(courseMaterials.length > 0 || personalFiles.length > 0) && (
            <div className="mb-6">
              <h2 className="mb-3 text-sm font-medium text-muted-foreground">
                Materials
              </h2>
              <div className="space-y-0.5">
                {courseMaterials.map((m) => (
                  <MaterialItem key={m.id} material={m} />
                ))}
                {personalFiles.map((f) => (
                  <PersonalFileItem key={f.id} file={f} />
                ))}
              </div>
            </div>
          )}

        </>
      )}

      {/* Moodle Materials — lazy-loaded on demand; always shown regardless of local-content emptiness */}
      <MoodleMaterialsSection courseId={courseId} />
    </div>
  );
}
