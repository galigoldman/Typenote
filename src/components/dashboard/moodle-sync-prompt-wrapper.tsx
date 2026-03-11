'use client';

import { MoodleSyncPrompt } from './moodle-sync-prompt';
import { toast } from 'sonner';

interface MoodleSyncPromptWrapperProps {
  moodleConnection: { domain: string; instanceId: string } | null;
}

export function MoodleSyncPromptWrapper({
  moodleConnection,
}: MoodleSyncPromptWrapperProps) {
  function handleSyncClick() {
    toast.info('Sync dialog coming soon');
  }

  return (
    <MoodleSyncPrompt
      moodleConnection={moodleConnection}
      onSyncClick={handleSyncClick}
    />
  );
}
