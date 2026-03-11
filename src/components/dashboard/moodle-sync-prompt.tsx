'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useMoodleExtension } from '@/hooks/use-moodle-extension';

interface MoodleSyncPromptProps {
  moodleConnection: { domain: string; instanceId: string } | null;
  onSyncClick: () => void;
}

export function MoodleSyncPrompt({
  moodleConnection,
  onSyncClick,
}: MoodleSyncPromptProps) {
  const { isInstalled, isChecking, checkMoodleLogin } = useMoodleExtension();
  const [loginStatus, setLoginStatus] = useState<{
    checked: boolean;
    loggedIn: boolean;
  }>({ checked: false, loggedIn: false });

  // Check Moodle login status when extension is installed and connection exists
  useEffect(() => {
    if (isChecking || !isInstalled || !moodleConnection) return;

    async function checkLogin() {
      const result = await checkMoodleLogin(
        `https://${moodleConnection!.domain}`,
      );
      setLoginStatus({
        checked: true,
        loggedIn: result?.loggedIn ?? false,
      });
    }
    checkLogin();
  }, [isChecking, isInstalled, moodleConnection, checkMoodleLogin]);

  if (isChecking) {
    return null;
  }

  // State 1: Extension not installed
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
          {/* TODO: Replace with Chrome Web Store link when extension is published */}
          <Button variant="outline" size="sm" disabled>
            Install Extension
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Extension installed but no connection configured
  if (!moodleConnection) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Moodle Integration</CardTitle>
          <CardDescription>
            Connect your Moodle account in Settings to start syncing courses.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  // State 2: Not logged into Moodle
  if (!loginStatus.checked || !loginStatus.loggedIn) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Moodle Integration</CardTitle>
          <CardDescription>
            Log into your Moodle account to sync courses from{' '}
            <strong>{moodleConnection.domain}</strong>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" size="sm" asChild>
            <a
              href={`https://${moodleConnection.domain}/login`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Log into Moodle
            </a>
          </Button>
        </CardContent>
      </Card>
    );
  }

  // State 3: Logged in - show sync button
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
