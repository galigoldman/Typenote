'use client';

import { useState } from 'react';
import { MoodleSyncPrompt } from './moodle-sync-prompt';
import { MoodleSyncDialog } from './moodle-sync-dialog';

interface MoodleSyncWrapperProps {
  moodleConnection: { domain: string; instanceId: string } | null;
}

/**
 * Orchestrates the interaction between the MoodleSyncPrompt (card that
 * shows sync status / "Sync with Moodle" button) and the MoodleSyncDialog
 * (modal that lists courses and lets the user pick which to sync).
 */
export function MoodleSyncWrapper({
  moodleConnection,
}: MoodleSyncWrapperProps) {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <>
      <MoodleSyncPrompt
        moodleConnection={moodleConnection}
        onSyncClick={() => setDialogOpen(true)}
      />
      {moodleConnection && (
        <MoodleSyncDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          moodleConnection={moodleConnection}
        />
      )}
    </>
  );
}
