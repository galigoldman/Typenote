import { Suspense } from 'react';
import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { PostHogProvider, PostHogPageView } from '@posthog/next';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { PostHogIdentify } from '@/lib/analytics/identify';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Typenote',
  description: 'Smart notes for STEM students',
  applicationName: 'Typenote',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Typenote',
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: '/favicon.ico',
    apple: '/icons/apple-touch-icon.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#0a0a0a',
  viewportFit: 'cover',
};

const posthogKey =
  process.env.NODE_ENV === 'production'
    ? process.env.NEXT_PUBLIC_POSTHOG_KEY
    : undefined;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const content = (
    <>
      <TooltipProvider>{children}</TooltipProvider>
      <Toaster />
    </>
  );

  return (
    <html lang="en" className="h-full">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased h-full`}
      >
        {posthogKey ? (
          <PostHogProvider
            apiKey={posthogKey}
            clientOptions={{
              api_host: '/ingest',
              capture_pageview: false,
              capture_exceptions: process.env.NODE_ENV === 'production',
              session_recording: {
                maskAllInputs: true,
              },
            }}
          >
            <Suspense fallback={null}>
              <PostHogPageView />
            </Suspense>
            <PostHogIdentify />
            {content}
          </PostHogProvider>
        ) : (
          content
        )}
      </body>
    </html>
  );
}
