'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useMoodleExtension } from '@/hooks/use-moodle-extension';
import {
  saveMoodleConnection,
  removeMoodleConnection,
} from '@/lib/actions/moodle-sync';
import { toast } from 'sonner';

interface MoodleConnectionSetupProps {
  currentConnection?: {
    domain: string;
    instanceId: string;
  } | null;
}

export function MoodleConnectionSetup({
  currentConnection,
}: MoodleConnectionSetupProps) {
  const { state, checkPermission, requestPermission } = useMoodleExtension();
  const [url, setUrl] = useState(
    currentConnection?.domain ? `https://${currentConnection.domain}` : '',
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [permissionMissing, setPermissionMissing] = useState(false);

  // On mount with an existing connection, verify the extension still has host permission.
  useEffect(() => {
    if (!currentConnection || state.status !== 'installed') return;
    let cancelled = false;
    checkPermission(`https://${currentConnection.domain}`).then((granted) => {
      if (!cancelled) setPermissionMissing(!granted);
    });
    return () => {
      cancelled = true;
    };
  }, [currentConnection, state.status, checkPermission]);

  if (state.status === 'checking') {
    return null;
  }

  // Parent (MoodleSyncPrompt) only renders us when state === 'installed', but be safe.
  if (state.status !== 'installed') {
    return null;
  }

  async function handleSave() {
    setError(null);
    setSaving(true);
    try {
      let domain: string;
      try {
        const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
        const basePath = parsed.pathname
          .replace(
            /\/(my|course|login|mod|lib|theme|admin|message|calendar|user|badges|grade|report|backup|blocks|question|tag|cohort|enrol|webservice|auth|completion|files|search)\b.*/,
            '',
          )
          .replace(/\/+$/, '');
        domain = parsed.host + basePath;
      } catch {
        setError('Please enter a valid URL');
        setSaving(false);
        return;
      }

      if (!domain || domain.length < 3) {
        setError('Please enter a valid Moodle URL');
        setSaving(false);
        return;
      }

      const granted = await requestPermission(`https://${domain}`);
      if (!granted) {
        setError(
          'Permission required. Allow access to this Moodle domain in the popup, or click Connect again.',
        );
        setSaving(false);
        return;
      }

      await saveMoodleConnection(domain);
      setPermissionMissing(false);
      toast.success('Moodle connection saved');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to save connection',
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleGrantExisting() {
    if (!currentConnection) return;
    const granted = await requestPermission(
      `https://${currentConnection.domain}`,
    );
    if (granted) {
      setPermissionMissing(false);
      toast.success(`Access granted to ${currentConnection.domain}`);
    } else {
      toast.error('Permission required. Try again from chrome://extensions.');
    }
  }

  async function handleRemove() {
    try {
      await removeMoodleConnection();
      setUrl('');
      setPermissionMissing(false);
      toast.success('Moodle connection removed');
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Failed to remove connection',
      );
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="moodle-url">Moodle URL</Label>
        <div className="flex gap-2">
          <Input
            id="moodle-url"
            placeholder="moodle.university.ac.il/2026"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={saving}
          />
          <Button onClick={handleSave} disabled={saving || !url.trim()}>
            {saving ? 'Saving...' : currentConnection ? 'Update' : 'Connect'}
          </Button>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      {currentConnection && (
        <div className="flex items-center justify-between rounded-md border px-3 py-2">
          <span className="text-sm">
            Connected to <strong>{currentConnection.domain}</strong>
          </span>
          <Button variant="ghost" size="sm" onClick={handleRemove}>
            Disconnect
          </Button>
        </div>
      )}

      {currentConnection && permissionMissing && (
        <div className="flex items-center justify-between rounded-md border border-amber-400/40 bg-amber-50 dark:bg-amber-950/30 px-3 py-2">
          <p className="text-sm">
            The extension needs access to{' '}
            <strong>{currentConnection.domain}</strong> to sync.
          </p>
          <Button size="sm" onClick={handleGrantExisting}>
            Grant access to {currentConnection.domain}
          </Button>
        </div>
      )}
    </div>
  );
}
