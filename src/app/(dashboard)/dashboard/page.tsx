import { createClient } from '@/lib/supabase/server';
import { FolderCard } from '@/components/dashboard/folder-card';
import { FolderDialog } from '@/components/dashboard/folder-dialog';
import { CourseCard } from '@/components/dashboard/course-card';
import { CourseDialog } from '@/components/dashboard/course-dialog';
import { DocumentCard } from '@/components/dashboard/document-card';
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

  // Fetch current user for Moodle connection lookup
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Fetch Moodle connection (returns null if none configured)
  let moodleConnection: { domain: string; instanceId: string } | null = null;
  if (user) {
    const connection = await getUserMoodleConnection(user.id);
    if (connection?.moodle_instances) {
      const instance = connection.moodle_instances as { id: string; domain: string };
      moodleConnection = {
        domain: instance.domain,
        instanceId: instance.id,
      };
    }
  }

  const { data: folders } = await supabase
    .from('folders')
    .select('*')
    .is('parent_id', null)
    .order('position', { ascending: true });

  const { data: courses } = await supabase
    .from('courses')
    .select('*')
    .is('folder_id', null)
    .order('position', { ascending: true });

  const { data: documents } = await supabase
    .from('documents')
    .select('*')
    .is('folder_id', null)
    .order('position', { ascending: true });

  const typedFolders = (folders as Folder[] | null) ?? [];
  const typedCourses = (courses as Course[] | null) ?? [];
  const typedDocuments = (documents as Document[] | null) ?? [];
  const isEmpty =
    typedFolders.length === 0 &&
    typedCourses.length === 0 &&
    typedDocuments.length === 0;

  return (
    <div className="p-6">
      <MoodleSyncPromptWrapper moodleConnection={moodleConnection} />

      <div className="mb-6 mt-4 flex items-center justify-between">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbPage>Home</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div className="flex items-center gap-2">
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
            <div className={typedFolders.length > 0 ? 'mt-6' : ''}>
              <h2 className="mb-3 text-sm font-medium text-muted-foreground">
                Courses
              </h2>
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
                typedFolders.length > 0 || typedCourses.length > 0 ? 'mt-6' : ''
              }
            >
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
        </>
      )}
    </div>
  );
}
