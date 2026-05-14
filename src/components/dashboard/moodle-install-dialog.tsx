'use client';

import { useState, type ReactNode } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ExternalLink } from 'lucide-react';

const EXTENSION_REPO_URL =
  'https://github.com/galigoldman/Typenote/tree/main/extension';

interface MoodleInstallDialogProps {
  trigger: ReactNode;
}

/**
 * Inline install instructions for the Typenote Moodle extension while the
 * extension is still pre-Chrome-Web-Store. Built for the small beta-tester
 * group: clone the repo, build the unpacked extension, load it in Chrome.
 *
 * Once we publish to the Chrome Web Store this whole component can be
 * replaced with a single anchor tag pointing at the listing.
 */
export function MoodleInstallDialog({ trigger }: MoodleInstallDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Install the Typenote extension</DialogTitle>
          <DialogDescription>
            The extension is in beta and not yet on the Chrome Web Store. Follow
            these steps to load it as an unpacked extension in any Chromium
            browser (Chrome, Edge, Brave, Arc).
          </DialogDescription>
        </DialogHeader>

        <ol className="ml-5 list-decimal space-y-3 text-sm">
          <li>
            <p>
              Clone the repo and build the extension bundle:{' '}
              <span className="block">
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                  git clone https://github.com/galigoldman/Typenote.git
                </code>
              </span>
              <span className="block">
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                  cd Typenote/extension && npm install && npm run build
                </code>
              </span>
            </p>
          </li>
          <li>
            Open{' '}
            <code className="rounded bg-muted px-1 font-mono">
              chrome://extensions
            </code>{' '}
            in a new tab.
          </li>
          <li>
            Toggle <strong>Developer mode</strong> on (top-right corner of the
            page).
          </li>
          <li>
            Click <strong>Load unpacked</strong> and pick the{' '}
            <code className="rounded bg-muted px-1 font-mono">extension/</code>{' '}
            folder from the repo you just cloned.
          </li>
          <li>
            Copy the extension ID Chrome shows on the new card (a 32-character
            lowercase string).
          </li>
          <li>
            <strong>Refresh this page.</strong> The card will switch to "Enter
            your Moodle URL".
          </li>
        </ol>

        <p className="text-xs text-muted-foreground">
          Need help? See the full quickstart in{' '}
          <code className="font-mono">extension/QUICKSTART.md</code>.
        </p>

        <DialogFooter className="sm:justify-between sm:gap-2">
          <Button asChild variant="outline" size="sm">
            <a href={EXTENSION_REPO_URL} target="_blank" rel="noreferrer">
              View on GitHub
              <ExternalLink className="ml-2 size-3.5" aria-hidden />
            </a>
          </Button>
          <Button size="sm" onClick={() => setOpen(false)}>
            Got it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
