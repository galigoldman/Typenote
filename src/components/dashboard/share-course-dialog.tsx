'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { copyText } from '@/lib/clipboard';
import {
  createOrUpdateShareLink,
  deactivateShareLink,
  regenerateShareLink,
  listMembers,
  updateMemberRole,
  removeMember,
  type ShareRole,
  type MemberRow,
} from '@/lib/actions/course-sharing';

interface ShareCourseDialogProps {
  courseId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function shareUrl(token: string): string {
  if (typeof window === 'undefined') return '/share/' + token;
  return `${window.location.origin}/share/${token}`;
}

export function ShareCourseDialog({
  courseId,
  open,
  onOpenChange,
}: ShareCourseDialogProps) {
  const [tokens, setTokens] = useState<Record<ShareRole, string | null>>({
    viewer: null,
    contributor: null,
  });
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [busy, setBusy] = useState(false);

  const refreshMembers = useCallback(async () => {
    try {
      setMembers(await listMembers(courseId));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load members');
    }
  }, [courseId]);

  useEffect(() => {
    if (open) refreshMembers();
  }, [open, refreshMembers]);

  async function makeLink(role: ShareRole) {
    setBusy(true);
    try {
      const { token } = await createOrUpdateShareLink({ courseId, role });
      setTokens((t) => ({ ...t, [role]: token }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to create link');
    } finally {
      setBusy(false);
    }
  }

  async function regen(role: ShareRole) {
    setBusy(true);
    try {
      const { token } = await regenerateShareLink({ courseId, role });
      setTokens((t) => ({ ...t, [role]: token }));
      toast.success('New link generated; the old one no longer works');
    } finally {
      setBusy(false);
    }
  }

  async function disable(role: ShareRole) {
    setBusy(true);
    try {
      await deactivateShareLink({ courseId, role });
      setTokens((t) => ({ ...t, [role]: null }));
    } finally {
      setBusy(false);
    }
  }

  async function copy(token: string) {
    const ok = await copyText(shareUrl(token));
    if (ok) toast.success('Link copied');
    else toast.error('Could not copy — select the link and copy it manually');
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Share course</DialogTitle>
          <DialogDescription>
            Anyone with a link can join. Viewers can open materials;
            contributors can also add files. Your notes stay private.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {(['viewer', 'contributor'] as ShareRole[]).map((role) => (
            <div key={role} className="space-y-2">
              <Label className="capitalize">{role} link</Label>
              {tokens[role] ? (
                <div className="flex flex-wrap gap-2">
                  <Input
                    readOnly
                    value={shareUrl(tokens[role]!)}
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void copy(tokens[role]!)}
                  >
                    Copy
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() => regen(role)}
                  >
                    Regenerate
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => disable(role)}
                  >
                    Disable
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => makeLink(role)}
                >
                  Create {role} link
                </Button>
              )}
            </div>
          ))}

          <div className="space-y-2">
            <Label>Members</Label>
            {members.length === 0 ? (
              <p className="text-sm text-muted-foreground">No members yet.</p>
            ) : (
              <ul className="space-y-1">
                {members.map((m) => (
                  <li
                    key={m.user_id}
                    className="flex items-center justify-between gap-2 text-sm"
                  >
                    <span>{m.display_name ?? m.email ?? m.user_id}</span>
                    <span className="flex items-center gap-2">
                      <select
                        className="rounded border px-1 py-0.5 text-xs"
                        value={m.role}
                        onChange={async (e) => {
                          await updateMemberRole({
                            courseId,
                            userId: m.user_id,
                            role: e.target.value as ShareRole,
                          });
                          await refreshMembers();
                        }}
                      >
                        <option value="viewer">viewer</option>
                        <option value="contributor">contributor</option>
                      </select>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={async () => {
                          await removeMember({ courseId, userId: m.user_id });
                          await refreshMembers();
                        }}
                      >
                        Remove
                      </Button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
