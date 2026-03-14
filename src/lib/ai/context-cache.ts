import crypto from 'crypto';

import { GoogleGenAI } from '@google/genai';

import { createAdminClient } from '@/lib/supabase/admin';

function getGenAI() {
  return new GoogleGenAI({
    apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? '',
  });
}

const CACHE_TTL_SECONDS = 7200; // 2 hours

function hashMaterials(text: string): string {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

export interface CacheResult {
  cacheName: string | null;
  isNew: boolean;
}

export async function getOrCreateCache(
  courseId: string,
  weekId: string,
  materialsText: string,
): Promise<CacheResult> {
  const admin = createAdminClient();
  const materialsHash = hashMaterials(materialsText);

  // Check if a valid cache exists
  const { data: existing } = await admin
    .from('context_cache_registry')
    .select('id, cache_name, materials_hash, expires_at')
    .eq('course_id', courseId)
    .eq('week_id', weekId)
    .single();

  if (existing) {
    const isExpired = new Date(existing.expires_at) < new Date();
    const hashMatches = existing.materials_hash === materialsHash;

    if (!isExpired && hashMatches) {
      return { cacheName: existing.cache_name, isNew: false };
    }

    // Expired or materials changed — delete old entry
    await admin
      .from('context_cache_registry')
      .delete()
      .eq('id', existing.id);
  }

  // Create new Gemini cache
  try {
    const cache = await getGenAI().caches.create({
      model: 'gemini-2.5-flash',
      config: {
        contents: [
          {
            role: 'user',
            parts: [{ text: materialsText }],
          },
        ],
        ttl: `${CACHE_TTL_SECONDS}s`,
      },
    });

    const cacheName = cache.name ?? null;
    if (!cacheName) {
      return { cacheName: null, isNew: false };
    }

    const expiresAt = new Date(Date.now() + CACHE_TTL_SECONDS * 1000).toISOString();

    // Store in registry
    await admin.from('context_cache_registry').upsert(
      {
        course_id: courseId,
        week_id: weekId,
        cache_name: cacheName,
        materials_hash: materialsHash,
        expires_at: expiresAt,
      },
      { onConflict: 'course_id,week_id' },
    );

    return { cacheName, isNew: true };
  } catch (err) {
    console.error('Failed to create Gemini context cache:', err);
    return { cacheName: null, isNew: false };
  }
}

export async function invalidateCache(
  courseId: string,
  weekId: string,
): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from('context_cache_registry')
    .delete()
    .eq('course_id', courseId)
    .eq('week_id', weekId);
}
