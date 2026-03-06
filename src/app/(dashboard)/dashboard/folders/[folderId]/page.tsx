import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { FolderCard } from '@/components/dashboard/folder-card';
import { FolderDialog } from '@/components/dashboard/folder-dialog';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import type { Folder, Document } from '@/types/database';

export default async function FolderPage({
  params,
}: {
  params: Promise<{ folderId: string }>;
}) {
  const { folderId } = await params;
  const supabase = await createClient();

  const { data: folder } = await supabase
    .from('folders')
    .select('*')
    .eq('id', folderId)
    .single();

  if (!folder) {
    notFound();
  }

  const typedFolder = folder as Folder;

  const { data: subfolders } = await supabase
    .from('folders')
    .select('*')
    .eq('parent_id', folderId)
    .order('position', { ascending: true });

  const { data: documents } = await supabase
    .from('documents')
    .select('*')
    .eq('folder_id', folderId)
    .order('position', { ascending: true });

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
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{typedFolder.name}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <FolderDialog parentId={folderId} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {(subfolders as Folder[] | null)?.map((subfolder) => (
          <FolderCard key={subfolder.id} folder={subfolder} />
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
