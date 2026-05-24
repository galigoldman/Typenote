import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth/get-current-user';
import { FolderCard } from '@/components/dashboard/folder-card';
import { FolderDialog } from '@/components/dashboard/folder-dialog';
import { CourseCard } from '@/components/dashboard/course-card';
import { CourseDialog } from '@/components/dashboard/course-dialog';
import { DocumentListWithMove } from '@/components/dashboard/document-list-with-move';
import { CreateDocumentDialog } from '@/components/dashboard/create-document-dialog';
import { EmptyState } from '@/components/dashboard/empty-state';
import { MoodleSyncPromptWrapper } from '@/components/dashboard/moodle-sync-prompt-wrapper';
import { getUserMoodleConnection } from '@/lib/queries/moodle';
import { Button } from '@/components/ui/button';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from '@/components/ui/breadcrumb';
import type { Folder, Document, Course } from '@/types/database';

export default async function DashboardPage() {
  const supabase = await createClient();
  const user = await getCurrentUser();

  const [
    moodleConnection,
    foldersResult,
    coursesResult,
    documentsResult,
  ] = await Promise.all([
    user ? getUserMoodleConnection(user.id) : Promise.resolve(null),
    supabase
      .from('folders')
      .select('*')
      .is('parent_id', null)
      .order('position', { ascending: true }),
    supabase
      .from('courses')
      .select('*')
      .is('folder_id', null)
      .order('position', { ascending: true }),
    supabase
      .from('documents')
      .select('*')
      .is('folder_id', null)
      .order('position', { ascending: true }),
  ]);

  let moodleConnectionInfo: { domain: string; instanceId: string } | null = null;
  if (moodleConnection?.moodle_instances) {
    const instance = moodleConnection.moodle_instances as {
      id: string;
      domain: string;
    };
    moodleConnectionInfo = {
      domain: instance.domain,
      instanceId: instance.id,
    };
  }

  const typedFolders = (foldersResult.data as Folder[] | null) ?? [];
  const typedCourses = (coursesResult.data as Course[] | null) ?? [];
  const typedDocuments = (documentsResult.data as Document[] | null) ?? [];
  const isEmpty =
    typedFolders.length === 0 &&
    typedCourses.length === 0 &&
    typedDocuments.length === 0;

  return (
    <div className="p-6">
      <MoodleSyncPromptWrapper moodleConnection={moodleConnectionInfo} />

      <div className="mb-6 mt-4 flex flex-wrap items-center justify-between gap-2">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbPage>Home</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div className="flex flex-wrap items-center gap-2">
          <CreateDocumentDialog folderId={null}>
            <Button variant="outline" size="sm">
              New Document
            </Button>
          </CreateDocumentDialog>
          <CourseDialog folderId={null} />
          <FolderDialog parentId={null} />
        </div>
      </div>

      {isEmpty ? (
        <EmptyState
          title="No folders or documents yet"
          description="Create a folder to organize your notes, or start a new document."
        />
      ) : (
        <>
          {typedFolders.length > 0 && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {typedFolders.map((folder) => (
                <FolderCard key={folder.id} folder={folder} />
              ))}
            </div>
          )}

          {typedCourses.length > 0 && (
            <div className={typedFolders.length > 0 ? 'mt-8' : ''}>
              <h2 className="mb-4 text-lg font-semibold">Courses</h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                {typedCourses.map((course) => (
                  <CourseCard key={course.id} course={course} />
                ))}
              </div>
            </div>
          )}

          {typedDocuments.length > 0 && (
            <div
              className={
                typedFolders.length > 0 || typedCourses.length > 0 ? 'mt-8' : ''
              }
            >
              <h2 className="mb-4 text-lg font-semibold">Documents</h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                <DocumentListWithMove documents={typedDocuments} />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
