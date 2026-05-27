'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { signInWithGoogle } from '@/lib/supabase/oauth';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

function SignupForm() {
  const searchParams = useSearchParams();
  const error = searchParams.get('error');

  const errorMessage =
    error === 'session_exchange_failed'
      ? 'Sign-up failed. Please try again. If this keeps happening, try clearing your browser cookies.'
      : error === 'oauth_init_failed'
        ? 'Could not start Google sign-up. Please try again.'
        : error
          ? 'Sign-up failed. Please try again.'
          : null;

  function handleGoogleSignup() {
    signInWithGoogle();
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl font-bold">Create Account</CardTitle>
        <CardDescription>Sign up to start taking notes</CardDescription>
      </CardHeader>
      <CardContent>
        {errorMessage && (
          <p
            className="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive"
            role="alert"
          >
            {errorMessage}
          </p>
        )}
        <Button className="w-full" onClick={handleGoogleSignup} type="button">
          Sign up with Google
        </Button>
      </CardContent>
      <CardFooter className="justify-center">
        <p className="text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link href="/login" className="text-primary underline">
            Sign in
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}

export default function SignupPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Suspense>
        <SignupForm />
      </Suspense>
    </div>
  );
}
