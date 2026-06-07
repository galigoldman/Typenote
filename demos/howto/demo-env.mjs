// Shared environment + persona constants for the How-To demo scripts.
// Reads Supabase credentials from the repo's .env.local so the scripts hit
// the same instance the dev server uses.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, '..', '..');
export const HOWTO_DIR = __dirname;

function parseEnvFile(file) {
  const out = {};
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

const env = parseEnvFile(path.join(REPO_ROOT, '.env.local'));

export const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
export const SUPABASE_ANON_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
export const SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing Supabase credentials in .env.local');
}

export const APP_URL = 'http://localhost:3000';

// The on-screen persona for every How-To video. A dedicated demo account so
// no real user data ever appears in a frame.
export const DEMO_EMAIL = 'maya.demo@typenote.dev';
export const DEMO_PASSWORD = 'TypenoteDemo!2026';
export const DEMO_NAME = 'Maya Levi';

export const AUTH_STATE_PATH = path.join(HOWTO_DIR, 'auth.json');
