import { createClient } from '@/lib/supabase/server';
import { FolderCard } from '@/components/dashboard/folder-card';
import { FolderDialog } from '@/components/dashboard/folder-dialog';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from '@/components/ui/breadcrumb';
import type { Folder, Document } from '@/types/database';

export default async function DashboardPage() {
  const supabase = await createClient();

  const { data: folders } = await supabase
    .from('folders')
    .select('*')
    .is('parent_id', null)
    .order('position', { ascending: true });

  const { data: documents } = await supabase
    .from('documents')
    .select('*')
    .is('folder_id', null)
    .order('position', { ascending: true });

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbPage>Home</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <FolderDialog parentId={null} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {(folders as Folder[] | null)?.map((folder) => (
          <FolderCard key={folder.id} folder={folder} />
        ))}
      </div>

      {documents && (documents as Document[]).length > 0 && (
        <div className="mt-6">
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">
            Documents
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {(documents as Document[]).map((doc) => (
              <div
                key={doc.id}
                className="rounded-lg border p-4 transition-colors hover:bg-muted/50"
              >
                <p className="font-medium">{doc.title}</p>
                <p className="text-sm text-muted-foreground">{doc.subject}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
