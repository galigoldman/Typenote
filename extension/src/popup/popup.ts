/**
 * Popup script — runs in the extension's own popup window.
 *
 * Two modes:
 *   1. PENDING — a Typenote tab has just asked the extension to access a
 *      specific Moodle host. The host is stashed in chrome.storage.session
 *      by the service worker. The popup auto-renders a one-host grant UI;
 *      clicking Allow runs chrome.permissions.request from a real user-
 *      gesture context (which onMessageExternal is NOT, hence this dance).
 *
 *   2. DEFAULT — no pending request. Show the user which Moodle sites are
 *      currently connected so they can revoke any.
 */

const PENDING_KEY = 'pendingPermission';

const KNOWN_NON_MOODLE_HOSTS = new Set<string>(['localhost', '127.0.0.1']);
const KNOWN_TYPENOTE_SUFFIXES = ['.typenote.app', 'typenote-two.vercel.app'];

interface PendingPermission {
  host: string;
  origin: string;
  createdAt: number;
}

function hostFromPattern(pattern: string): string {
  const match = pattern.match(/^https?:\/\/([^/]+)/);
  return match ? match[1] : pattern;
}

function isUserAddedMoodleHost(pattern: string): boolean {
  const host = hostFromPattern(pattern);
  if (KNOWN_NON_MOODLE_HOSTS.has(host)) return false;
  if (KNOWN_TYPENOTE_SUFFIXES.some((suffix) => host.endsWith(suffix))) {
    return false;
  }
  return true;
}

async function readPending(): Promise<PendingPermission | null> {
  const result = await chrome.storage.session.get(PENDING_KEY);
  const pending = result[PENDING_KEY] as PendingPermission | undefined;
  if (!pending) return null;
  // Expire stale stashes (e.g. user opened the popup an hour after the
  // dialog asked) so we don't grant something the user has forgotten about.
  const ageMs = Date.now() - pending.createdAt;
  if (ageMs > 10 * 60 * 1000) {
    await chrome.storage.session.remove(PENDING_KEY);
    return null;
  }
  return pending;
}

async function clearPending(): Promise<void> {
  await chrome.storage.session.remove(PENDING_KEY);
}

function setStatus(
  el: HTMLElement,
  message: string,
  kind: 'success' | 'error' | 'info' = 'info',
): void {
  el.textContent = message;
  el.classList.remove('success', 'error');
  if (kind === 'success') el.classList.add('success');
  if (kind === 'error') el.classList.add('error');
}

// ---- PENDING mode ----

async function renderPending(pending: PendingPermission): Promise<void> {
  const section = document.getElementById('pending-section') as HTMLElement;
  const hostEl = document.getElementById('pending-host') as HTMLElement;
  const allow = document.getElementById('pending-allow') as HTMLButtonElement;
  const cancel = document.getElementById('pending-cancel') as HTMLButtonElement;
  const status = document.getElementById('pending-status') as HTMLElement;

  hostEl.textContent = pending.host;
  section.hidden = false;

  allow.addEventListener('click', async () => {
    setStatus(status, '', 'info');
    allow.disabled = true;
    cancel.disabled = true;
    try {
      // The user just clicked this button — Chrome accepts this as a user
      // gesture, so chrome.permissions.request will display the native prompt.
      const granted = await chrome.permissions.request({
        origins: [pending.origin],
      });
      if (granted) {
        await clearPending();
        setStatus(status, `Connected ${pending.host}.`, 'success');
        // Close after a short pause so the user can see the confirmation.
        setTimeout(() => window.close(), 600);
      } else {
        setStatus(status, 'Permission was not granted.', 'error');
        allow.disabled = false;
        cancel.disabled = false;
      }
    } catch (err) {
      setStatus(status, `Failed: ${String(err)}`, 'error');
      allow.disabled = false;
      cancel.disabled = false;
    }
  });

  cancel.addEventListener('click', async () => {
    await clearPending();
    window.close();
  });
}

// ---- DEFAULT mode ----

async function renderDefault(): Promise<void> {
  const section = document.getElementById('default-section') as HTMLElement;
  const hostList = document.getElementById('host-list') as HTMLUListElement;
  const emptyState = document.getElementById('empty-state') as HTMLElement;

  section.hidden = false;

  async function refresh(): Promise<void> {
    const all = await chrome.permissions.getAll();
    const origins = (all.origins ?? []).filter(isUserAddedMoodleHost).sort();

    hostList.innerHTML = '';
    if (origins.length === 0) {
      emptyState.hidden = false;
      return;
    }
    emptyState.hidden = true;

    for (const origin of origins) {
      const li = document.createElement('li');

      const name = document.createElement('span');
      name.className = 'host-name';
      name.textContent = hostFromPattern(origin);
      li.appendChild(name);

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.textContent = 'Remove';
      removeBtn.addEventListener('click', async () => {
        try {
          await chrome.permissions.remove({ origins: [origin] });
        } catch {
          // Static host_permissions can't be removed via this API; ignore.
        }
        await refresh();
      });
      li.appendChild(removeBtn);

      hostList.appendChild(li);
    }
  }

  await refresh();
}

async function main(): Promise<void> {
  const pending = await readPending();
  if (pending) {
    await renderPending(pending);
  } else {
    await renderDefault();
  }
}

void main();
