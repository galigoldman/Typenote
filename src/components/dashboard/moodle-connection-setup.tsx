'use client';

import { useState } from 'react';
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
  const { isInstalled, isChecking } = useMoodleExtension();
  const [url, setUrl] = useState(
    currentConnection?.domain ? `https://${currentConnection.domain}` : '',
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (isChecking) {
    return (
      <p className="text-sm text-muted-foreground">
        Checking for Typenote extension...
      </p>
    );
  }

  if (!isInstalled) {
    return (
      <div className="rounded-lg border border-dashed p-4 text-center">
        <p className="text-sm font-medium">
          Typenote Moodle Extension Required
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Install the browser extension to sync your Moodle courses.
        </p>
        {/* TODO: Add Chrome Web Store link when published */}
      </div>
    );
  }

  async function handleSave() {
    setError(null);
    setSaving(true);

    try {
      // Parse and validate URL — keep host + base path (e.g. moodle.runi.ac.il/2026)
      let domain: string;
      try {
        const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
        // Strip known Moodle paths to extract just the base prefix
        let basePath = parsed.pathname
          .replace(/\/(my|course|login|mod|lib|theme|admin|message|calendar|user|badges|grade|report|backup|blocks|question|tag|cohort|enrol|webservice|auth|completion|files|search)\b.*/, '')
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

      await saveMoodleConnection(domain);
      toast.success('Moodle connection saved');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to save connection',
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove() {
    try {
      await removeMoodleConnection();
      setUrl('');
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
    </div>
  );
}
