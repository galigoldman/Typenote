'use client';

import Script from 'next/script';
import { usePathname } from 'next/navigation';
import { HELP_WIDGET_ID, HELP_MANIFEST_URL } from '@/lib/help/config';

/**
 * Mounts the Daymo help widget (floating bubble → chat that answers with
 * clips from the how-to videos) on dashboard pages.
 *
 * Hidden on the document editor: the editor has its own Ask AI panel in the
 * bottom-right, and the bubble would cover its send button and citation
 * badges. The widget renders into a closed shadow root, so the only outer
 * styling surface is the host element itself — a display:none on
 * #daymo-widget-root hides bubble and panel together.
 */
export function HelpWidget() {
  const pathname = usePathname();
  const isEditor = pathname?.startsWith('/dashboard/documents/') ?? false;

  return (
    <>
      {isEditor && (
        <style>{'#daymo-widget-root{display:none!important}'}</style>
      )}
      <Script
        src="/daymo-widget.js"
        strategy="afterInteractive"
        data-widget-id={HELP_WIDGET_ID}
        data-base-url="/api/help"
        data-manifest-url={HELP_MANIFEST_URL}
      />
    </>
  );
}
