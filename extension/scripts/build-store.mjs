#!/usr/bin/env node
// Build a Chrome Web Store-ready bundle of the extension.
//
// Why this exists: the dev manifest contains artifacts that either break
// the store submission outright ("key" field locks the extension ID and
// must be absent for a fresh submission) or look suspicious to reviewers
// (raw-IP HTTP origins, plain localhost host permissions, world-wide
// web_accessible_resources). This script produces a clean copy under
// extension/store-build/ and a zip you can upload directly.
//
// The dev tree on disk is untouched — keep `pnpm dev` and local loading
// working as before.

import { execSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
  cpSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import AdmZip from 'adm-zip';

const __dirname = dirname(fileURLToPath(import.meta.url));
const extensionRoot = resolve(__dirname, '..');
const outDir = join(extensionRoot, 'store-build');
const zipPath = join(extensionRoot, 'store-build.zip');

function step(msg) {
  console.log(`\x1b[36m▸\x1b[0m ${msg}`);
}

// 1. Fresh minified build into dist/.
step('Running production build (esbuild --minify)');
execSync('pnpm build', { cwd: extensionRoot, stdio: 'inherit' });

// 2. Reset store-build/.
step('Resetting store-build/');
if (existsSync(outDir)) rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
if (existsSync(zipPath)) rmSync(zipPath);

// 3. Copy runtime assets.
step('Copying runtime assets');
cpSync(join(extensionRoot, 'dist'), join(outDir, 'dist'), { recursive: true });
cpSync(join(extensionRoot, 'icons'), join(outDir, 'icons'), {
  recursive: true,
});
cpSync(join(extensionRoot, 'popup.html'), join(outDir, 'popup.html'));
cpSync(join(extensionRoot, 'popup.css'), join(outDir, 'popup.css'));

// 4. Sanitise manifest.
step('Sanitising manifest.json');
const manifest = JSON.parse(
  readFileSync(join(extensionRoot, 'manifest.json'), 'utf8'),
);

// Why each removal matters — see header.
delete manifest.key;

const STRIP_ORIGINS = new Set([
  'http://localhost:3000/*',
  'http://localhost:3001/*',
  'http://151.145.83.151:3001/*',
]);

manifest.host_permissions = (manifest.host_permissions ?? []).filter(
  (h) => !STRIP_ORIGINS.has(h) && !h.startsWith('http://'),
);

if (manifest.externally_connectable?.matches) {
  manifest.externally_connectable.matches =
    manifest.externally_connectable.matches.filter(
      (m) => !STRIP_ORIGINS.has(m) && !m.startsWith('http://'),
    );
}

// Narrow web_accessible_resources to typical Moodle URL patterns.
// `https://moodle.*/*` catches `moodle.bgu.ac.il` style domains;
// `https://*.moodle.*/*` catches `<faculty>.moodle.<inst>.<tld>` style.
// Combined they cover the overwhelming majority of Moodle deployments
// without exposing the scraper to arbitrary sites.
if (Array.isArray(manifest.web_accessible_resources)) {
  manifest.web_accessible_resources = manifest.web_accessible_resources.map(
    (entry) => ({
      ...entry,
      matches: ['https://moodle.*/*', 'https://*.moodle.*/*'],
    }),
  );
}

writeFileSync(
  join(outDir, 'manifest.json'),
  JSON.stringify(manifest, null, 2) + '\n',
  'utf8',
);

// 5. Sanity checks — fail loud if anything dev-only sneaks back in.
step('Running sanity checks');
const finalManifest = JSON.parse(
  readFileSync(join(outDir, 'manifest.json'), 'utf8'),
);
const errors = [];
if (finalManifest.key) errors.push('manifest still contains "key"');
const allHosts = [
  ...(finalManifest.host_permissions ?? []),
  ...(finalManifest.externally_connectable?.matches ?? []),
];
for (const h of allHosts) {
  if (h.startsWith('http://')) errors.push(`plain http origin retained: ${h}`);
  if (/\d+\.\d+\.\d+\.\d+/.test(h)) errors.push(`raw-IP origin retained: ${h}`);
}
if (errors.length) {
  console.error('\x1b[31m✖ Store build failed sanity checks:\x1b[0m');
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

// 6. Zip.
step('Creating store-build.zip');
const zip = new AdmZip();
zip.addLocalFolder(outDir);
zip.writeZip(zipPath);

const sizeKb = (zip.toBuffer().length / 1024).toFixed(1);
console.log(`\n\x1b[32m✔ Store bundle ready\x1b[0m`);
console.log(`  Directory: ${outDir}`);
console.log(`  Zip:       ${zipPath} (${sizeKb} KB)`);
console.log(`  Manifest version: ${finalManifest.version}`);
console.log(
  `\nUpload the zip at https://chrome.google.com/webstore/devconsole`,
);
