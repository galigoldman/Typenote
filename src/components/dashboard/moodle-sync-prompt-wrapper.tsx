'use client';

import { useState } from 'react';
import { MoodleSyncPrompt } from './moodle-sync-prompt';
import { MoodleSyncDialog } from './moodle-sync-dialog';

interface MoodleSyncPromptWrapperProps {
  moodleConnection: { domain: string; instanceId: string } | null;
}

export function MoodleSyncPromptWrapper({
  moodleConnection,
}: MoodleSyncPromptWrapperProps) {
  const [dialogOpen, setDialogOpen] = useState(false);

  function handleSyncClick() {
    setDialogOpen(true);
  }

  return (
    <>
      <MoodleSyncPrompt
        moodleConnection={moodleConnection}
        onSyncClick={handleSyncClick}
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
