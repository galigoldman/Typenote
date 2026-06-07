import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { signOut } from '@/lib/actions/auth';
import { SidebarFolderTree } from '@/components/dashboard/sidebar-folder-tree';
import { SidebarLayout } from '@/components/dashboard/sidebar-layout';
import { HelpWidget } from '@/components/help/help-widget';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Gauge, HelpCircle, LogOut } from 'lucide-react';

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

  // Admin-only nav entry. Rendered server-side and only for admins, so the
  // link never ships to non-admins. Access is still enforced by requireAdmin()
  // on /admin (defense in depth) — the link is convenience, not the control.
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single();
  const isAdmin = profile?.is_admin ?? false;

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
      {isAdmin && (
        <div className="px-2 pt-2">
          <Button
            asChild
            variant="ghost"
            className="w-full justify-start min-h-[44px] hover:bg-primary/10 hover:text-primary"
          >
            <Link href="/admin">
              <Gauge className="size-4" />
              AI Usage
            </Link>
          </Button>
        </div>
      )}
      <div className="px-2 pt-2">
        <Button
          asChild
          variant="ghost"
          className="w-full justify-start min-h-[44px] hover:bg-primary/10 hover:text-primary"
        >
          <Link href="/help">
            <HelpCircle className="size-4" />
            Help
          </Link>
        </Button>
      </div>
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

  return (
    <SidebarLayout sidebar={sidebarContent}>
      {children}
      {/* Daymo help widget: floating bubble → chat that answers with clips
          from the how-to videos. Same chat backend + manifest as /help.
          Hidden on the document editor (collides with the Ask AI panel). */}
      <HelpWidget />
    </SidebarLayout>
  );
}
