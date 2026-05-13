'use client';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  useMoodleExtension,
  EXPECTED_EXTENSION_VERSION,
} from '@/hooks/use-moodle-extension';
import { MoodleCardSkeleton } from './moodle-card-skeleton';
import { MoodleConnectionSetup } from './moodle-connection-setup';

interface MoodleSyncPromptProps {
  moodleConnection: { domain: string; instanceId: string } | null;
  onSyncClick: () => void;
}

export function MoodleSyncPrompt({
  moodleConnection,
  onSyncClick,
}: MoodleSyncPromptProps) {
  const { state } = useMoodleExtension();

  if (state.status === 'checking') {
    return <MoodleCardSkeleton />;
  }

  if (state.status === 'not-installed') {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Moodle Integration</CardTitle>
          <CardDescription>
            Install the Typenote extension to sync your Moodle courses and
            materials automatically.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" size="sm" disabled>
            Install Extension
          </Button>
          <p className="mt-2 text-xs text-muted-foreground">
            Coming soon to the Chrome Web Store. Refresh this page after
            installing.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (state.status === 'version-mismatch') {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Moodle Integration</CardTitle>
          <CardDescription>
            Update the Typenote extension to continue syncing. Installed
            version: <strong>{state.installedVersion}</strong>. Required:{' '}
            <strong>{EXPECTED_EXTENSION_VERSION}</strong>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" size="sm" disabled>
            Update Extension
          </Button>
          <p className="mt-2 text-xs text-muted-foreground">
            Refresh this page after updating.
          </p>
        </CardContent>
      </Card>
    );
  }

  // state.status === 'installed'
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
