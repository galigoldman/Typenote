// Publishes the Daymo help-center bundle produced by `daymo publish` to the
// places the app reads it from:
//
//   1. Supabase Storage public bucket `help-videos` — the heavy assets
//      (output.mp4, poster.jpg, index.json with embeddings, manifest.json).
//      Absolute URLs baked at `daymo index` time point here.
//   2. `public/help/` in the repo — a same-origin copy of manifest.json with
//      posterUrl rewritten to `/help/posters/<demoId>.jpg` plus the posters
//      themselves. This keeps the gallery working in CI/preview without any
//      network dependency, and serves posters from the app's own CDN.
//
// Re-render recipe: capture/stitch → `daymo index` → `daymo publish --out
// demos/howto/.publish` → `node demos/howto/publish-help-assets.mjs`.
import { createClient } from '@supabase/supabase-js';
import {
  readFile,
  readdir,
  writeFile,
  mkdir,
  copyFile,
} from 'node:fs/promises';
import path from 'node:path';
import {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  HOWTO_DIR,
} from './demo-env.mjs';

const BUCKET = 'help-videos';
const PUBLISH_DIR = path.join(HOWTO_DIR, '.publish');
const PUBLIC_HELP_DIR = path.join(HOWTO_DIR, '..', '..', 'public', 'help');

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// --- ensure the public bucket exists -----------------------------------------
{
  const { data: buckets, error } = await admin.storage.listBuckets();
  if (error) throw new Error(`listBuckets: ${error.message}`);
  if (!buckets.some((b) => b.name === BUCKET)) {
    const { error: createError } = await admin.storage.createBucket(BUCKET, {
      public: true,
    });
    if (createError) throw new Error(`createBucket: ${createError.message}`);
    console.log(`created public bucket ${BUCKET}`);
  } else {
    console.log(`bucket ${BUCKET} exists`);
  }
}

// --- upload everything under .publish, preserving relative paths -------------
const CONTENT_TYPES = {
  '.mp4': 'video/mp4',
  '.jpg': 'image/jpeg',
  '.json': 'application/json',
  '.vtt': 'text/vtt',
};

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else yield full;
  }
}

let uploaded = 0;
for await (const file of walk(PUBLISH_DIR)) {
  const key = path.relative(PUBLISH_DIR, file).split(path.sep).join('/');
  const body = await readFile(file);
  const contentType =
    CONTENT_TYPES[path.extname(file)] ?? 'application/octet-stream';
  const { error } = await admin.storage.from(BUCKET).upload(key, body, {
    contentType,
    upsert: true,
    cacheControl: '3600',
  });
  if (error) throw new Error(`upload ${key}: ${error.message}`);
  uploaded += 1;
  console.log(`uploaded ${key} (${(body.length / 1024).toFixed(0)} KB)`);
}
console.log(`storage: ${uploaded} file(s) → ${BUCKET}`);

// --- same-origin manifest + posters under public/help/ -----------------------
const manifest = JSON.parse(
  await readFile(path.join(PUBLISH_DIR, 'manifest.json'), 'utf8'),
);
await mkdir(path.join(PUBLIC_HELP_DIR, 'posters'), { recursive: true });
for (const demo of manifest.demos) {
  demo.posterUrl = `/help/posters/${demo.demoId}.jpg`;
  await copyFile(
    path.join(PUBLISH_DIR, demo.demoId, 'poster.jpg'),
    path.join(PUBLIC_HELP_DIR, 'posters', `${demo.demoId}.jpg`),
  );
}
await writeFile(
  path.join(PUBLIC_HELP_DIR, 'manifest.json'),
  JSON.stringify(manifest, null, 2),
);
console.log(
  `public/help: manifest.json + ${manifest.demos.length} poster(s) written`,
);
