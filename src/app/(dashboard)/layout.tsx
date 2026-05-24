import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/get-current-user';
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
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  const sidebarContent = (
    <>
      <div className="flex h-14 items-center px-4">
        <h1 className="text-xl font-extrabold tracking-tight text-primary">
          <span className="text-primary/60">T</span>ypenote
        </h1>
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
            className="w-full justify-start min-h-[44px] hover:bg-primary/10 hover:text-primary"
          >
            <LogOut className="size-4" />
            Sign out
          </Button>
        </form>
      </div>
    </>
  );

  return <SidebarLayout sidebar={sidebarContent}>{children}</SidebarLayout>;
}
