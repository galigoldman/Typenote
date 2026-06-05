import { requireAdmin } from '@/lib/auth/require-admin';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdmin(); // 404s for non-admins; redirects handled by middleware
  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold tracking-tight">AI Usage</h1>
      {children}
    </div>
  );
}
