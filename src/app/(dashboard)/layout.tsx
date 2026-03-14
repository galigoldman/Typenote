import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { signOut } from '@/lib/actions/auth';
import { SidebarFolderTree } from '@/components/dashboard/sidebar-folder-tree';
import { SidebarLayout } from '@/components/dashboard/sidebar-layout';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { LogOut } from 'lucide-react';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const sidebarContent = (
    <>
      <div className="flex h-14 items-center px-4">
        <h1 className="text-lg font-bold">Typenote</h1>
      </div>
      <Separator />
      <div className="flex-1 overflow-y-auto px-2 py-2">
        <SidebarFolderTree />
      </div>
      <Separator />
      <div className="p-2">
        <form action={signOut}>
          <Button
            type="submit"
            variant="ghost"
            className="w-full justify-start"
          >
            <LogOut className="size-4" />
            Sign out
          </Button>
        </form>
      </div>
    </>
  );

  return (
    <SidebarLayout sidebar={sidebarContent}>{children}</SidebarLayout>
  );
}
