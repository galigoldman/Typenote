import { get, set, del } from 'idb-keyval';
import { v4 as uuidv4 } from 'uuid';

export interface PendingEdit {
  id: string;
  document_id: string;
  field: 'content' | 'title';
  value: Record<string, unknown> | string;
  timestamp: string;
}

/** Key used to store the ordered list of pending edit IDs. */
const EDIT_KEYS_KEY = 'edit-keys';

function editKey(id: string): string {
  return `edit:${id}`;
}

/**
 * Retrieve the ordered list of pending edit IDs.
 */
async function getEditKeys(): Promise<string[]> {
  return (await get<string[]>(EDIT_KEYS_KEY)) ?? [];
}

/**
 * Persist the ordered list of pending edit IDs.
 */
async function setEditKeys(keys: string[]): Promise<void> {
  await set(EDIT_KEYS_KEY, keys);
}

/**
 * Queue a new edit for later sync. The edit is stored in IndexedDB and its ID
 * is appended to the ordered key list so edits can be replayed chronologically.
 */
export async function queueEdit(edit: Omit<PendingEdit, 'id'>): Promise<void> {
  const id = uuidv4();
  const pendingEdit: PendingEdit = { id, ...edit };

  await set(editKey(id), pendingEdit);

  const keys = await getEditKeys();
  keys.push(id);
  await setEditKeys(keys);
}

/**
 * Return all pending edits in chronological order (oldest first).
 */
export async function getPendingEdits(): Promise<PendingEdit[]> {
  const keys = await getEditKeys();
  const edits: PendingEdit[] = [];

  for (const id of keys) {
    const edit = await get<PendingEdit>(editKey(id));
    if (edit) {
      edits.push(edit);
    }
  }

  return edits;
}

/**
 * Remove a specific pending edit by its ID.
 */
export async function removePendingEdit(id: string): Promise<void> {
  await del(editKey(id));

  const keys = await getEditKeys();
  const updated = keys.filter((k) => k !== id);
  await setEditKeys(updated);
}

/**
 * Remove all pending edits.
 */
export async function clearPendingEdits(): Promise<void> {
  const keys = await getEditKeys();

  for (const id of keys) {
    await del(editKey(id));
  }

  await setEditKeys([]);
}
