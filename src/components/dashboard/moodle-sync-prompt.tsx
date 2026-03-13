'use client';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useMoodleExtension } from '@/hooks/use-moodle-extension';
import { MoodleConnectionSetup } from './moodle-connection-setup';

interface MoodleSyncPromptProps {
  moodleConnection: { domain: string; instanceId: string } | null;
  onSyncClick: () => void;
}

export function MoodleSyncPrompt({
  moodleConnection,
  onSyncClick,
}: MoodleSyncPromptProps) {
  const { isInstalled, isChecking } = useMoodleExtension();

  if (isChecking) {
    return null;
  }

  if (!isInstalled) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Moodle Integration</CardTitle>
          <CardDescription>
            Install the Typenote browser extension to sync your Moodle courses
            and materials automatically.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" size="sm" disabled>
            Install Extension
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!moodleConnection) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Moodle Integration</CardTitle>
          <CardDescription>
            Enter your Moodle URL to start syncing courses.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MoodleConnectionSetup />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Moodle Integration</CardTitle>
        <CardDescription>
          Connected to <strong>{moodleConnection.domain}</strong>. Sync your
          courses and materials.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button size="sm" onClick={onSyncClick}>
          Sync with Moodle
        </Button>
      </CardContent>
    </Card>
  );
}
