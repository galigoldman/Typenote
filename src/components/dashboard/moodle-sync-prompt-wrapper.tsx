'use client';

import { useState } from 'react';
import { MoodleSyncPrompt } from './moodle-sync-prompt';
import { MoodleSyncDialog } from './moodle-sync-dialog';
import { ExtensionGate } from './extension-gate';

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
    <ExtensionGate>
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
    </ExtensionGate>
  );
}
