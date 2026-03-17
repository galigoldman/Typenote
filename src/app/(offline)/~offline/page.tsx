'use client';

export default function OfflinePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="text-6xl">📡</div>
      <h1 className="text-2xl font-bold">You&apos;re Offline</h1>
      <p className="text-muted-foreground max-w-md">
        Please check your internet connection and try again. Your notes are safe
        — they&apos;ll be available once you&apos;re back online.
      </p>
      <button
        onClick={() => window.location.reload()}
        className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-6 py-2 text-sm font-medium transition-colors"
      >
        Try Again
      </button>
    </div>
  );
}
