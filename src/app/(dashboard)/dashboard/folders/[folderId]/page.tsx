import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { FolderCard } from '@/components/dashboard/folder-card';
import { FolderDialog } from '@/components/dashboard/folder-dialog';
import { DocumentCard } from '@/components/dashboard/document-card';
import { CreateDocumentDialog } from '@/components/dashboard/create-document-dialog';
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

  const typedSubfolders = (subfolders as Folder[] | null) ?? [];
  const typedDocuments = (documents as Document[] | null) ?? [];
  const isEmpty = typedSubfolders.length === 0 && typedDocuments.length === 0;

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
        <div className="flex items-center gap-2">
          <CreateDocumentDialog folderId={folderId}>
            <Button variant="outline" size="sm">
              New Document
            </Button>
          </CreateDocumentDialog>
          <FolderDialog parentId={folderId} />
        </div>
      </div>

      {isEmpty ? (
        <EmptyState
          title="This folder is empty"
          description="Create a subfolder or start a new document."
        />
      ) : (
        <>
          {typedSubfolders.length > 0 && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {typedSubfolders.map((subfolder) => (
                <FolderCard key={subfolder.id} folder={subfolder} />
              ))}
            </div>
          )}

          {typedDocuments.length > 0 && (
            <div className="mt-6">
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
