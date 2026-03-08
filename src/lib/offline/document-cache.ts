import { get, set, del } from 'idb-keyval';

export interface CachedDocument {
  id: string;
  title: string;
  content: Record<string, unknown>;
  updated_at: string;
  is_dirty: boolean;
  cached_at: string;
}

const MAX_CACHED_DOCUMENTS = 50;

/** Key used to store the ordered list of cached document IDs (most recently used last). */
const DOC_KEYS_KEY = 'doc-keys';

function docKey(id: string): string {
  return `doc:${id}`;
}

/**
 * Retrieve the ordered list of cached document IDs.
 * The list is ordered from least-recently-used (index 0) to most-recently-used.
 */
async function getDocKeys(): Promise<string[]> {
  return (await get<string[]>(DOC_KEYS_KEY)) ?? [];
}

/**
 * Persist the ordered list of cached document IDs.
 */
async function setDocKeys(keys: string[]): Promise<void> {
  await set(DOC_KEYS_KEY, keys);
}

/**
 * Enforce the LRU eviction policy: if the number of cached documents exceeds
 * MAX_CACHED_DOCUMENTS, remove the least-recently-used entries until we are
 * back within the limit.
 */
async function evictIfNeeded(docKeys: string[]): Promise<string[]> {
  const evicted = [...docKeys];
  while (evicted.length > MAX_CACHED_DOCUMENTS) {
    const lruId = evicted.shift()!;
    await del(docKey(lruId));
  }
  return evicted;
}

/**
 * Cache a document in IndexedDB. If the document is already cached, its entry
 * is updated and it is moved to the most-recently-used position. If the cache
 * is full, the least-recently-used document is evicted.
 */
export async function cacheDocument(doc: {
  id: string;
  title: string;
  content: Record<string, unknown>;
  updated_at: string;
}): Promise<void> {
  const cached: CachedDocument = {
    id: doc.id,
    title: doc.title,
    content: doc.content,
    updated_at: doc.updated_at,
    is_dirty: false,
    cached_at: new Date().toISOString(),
  };

  await set(docKey(doc.id), cached);

  // Update the LRU key list – move this id to the end (most recently used)
  let keys = await getDocKeys();
  keys = keys.filter((k) => k !== doc.id);
  keys.push(doc.id);

  // Evict if over the limit
  keys = await evictIfNeeded(keys);

  await setDocKeys(keys);
}

/**
 * Retrieve a cached document by its ID. Returns `undefined` if not found.
 */
export async function getCachedDocument(
  id: string,
): Promise<CachedDocument | undefined> {
  return get<CachedDocument>(docKey(id));
}

/**
 * List all cached documents in the order they were last cached (oldest first).
 */
export async function listCachedDocuments(): Promise<CachedDocument[]> {
  const keys = await getDocKeys();
  const docs: CachedDocument[] = [];

  for (const id of keys) {
    const doc = await get<CachedDocument>(docKey(id));
    if (doc) {
      docs.push(doc);
    }
  }

  return docs;
}

/**
 * Remove a cached document by its ID and update the key list.
 */
export async function removeCachedDocument(id: string): Promise<void> {
  await del(docKey(id));

  const keys = await getDocKeys();
  const updated = keys.filter((k) => k !== id);
  await setDocKeys(updated);
}

/**
 * Mark a cached document as dirty (has local changes that haven't been synced).
 */
export async function markDocumentDirty(id: string): Promise<void> {
  const doc = await get<CachedDocument>(docKey(id));
  if (!doc) return;

  doc.is_dirty = true;
  await set(docKey(id), doc);
}
