import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export default async function JoinSharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?next=' + encodeURIComponent('/share/' + token));
  }

  const { data: courseId, error } = await supabase.rpc('join_course_via_link', {
    p_token: token,
  });

  if (error || !courseId) {
    return (
      <div className="mx-auto mt-24 max-w-md px-4 text-center">
        <h1 className="text-xl font-semibold">This link isn&apos;t valid</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The share link is inactive or no longer exists. Ask the course owner
          for a new link.
        </p>
        <a className="mt-4 inline-block underline" href="/dashboard">
          Back to dashboard
        </a>
      </div>
    );
  }

  redirect('/dashboard/courses/' + courseId);
}
