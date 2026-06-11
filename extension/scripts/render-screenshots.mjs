#!/usr/bin/env node
// Render Chrome Web Store screenshots for the Typenote Moodle Sync popup.
//
// The popup is a 320px card with two real states (see src/popup/popup.ts):
//   1. "Connected Moodle sites" — the default view listing granted origins.
//   2. Permission grant — shown when the web app asks to read a new Moodle host.
//
// We embed the REAL popup.css and the exact markup popup.ts produces, then
// composite the card onto a 1280x800 canvas (a store-accepted size) with a
// faux browser toolbar so the image reads as "the extension, in use". No
// backend or live Moodle is needed — the pixels match the shipping popup.

import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const extensionRoot = resolve(__dirname, '..');
const outDir = join(extensionRoot, 'store-assets');
mkdirSync(outDir, { recursive: true });

const popupCss = readFileSync(join(extensionRoot, 'popup.css'), 'utf8');
const iconB64 = readFileSync(join(extensionRoot, 'icons', 'icon-128.png')).toString('base64');
const iconSrc = `data:image/png;base64,${iconB64}`;

// Exact inner markup each popup mode renders (mirrors popup.html + popup.ts).
const CONNECTED_BODY = `
  <header><h1>Typenote Moodle Sync</h1></header>
  <section class="connected">
    <h2>Connected Moodle sites</h2>
    <ul class="host-list">
      <li><span class="host-name">moodle.tau.ac.il</span><button type="button">Remove</button></li>
      <li><span class="host-name">moodle.huji.ac.il</span><button type="button">Remove</button></li>
    </ul>
    <p class="hint">Typenote only reads pages on the sites listed here.</p>
  </section>`;

const PENDING_BODY = `
  <header><h1>Typenote Moodle Sync</h1></header>
  <section class="pending">
    <p class="pending-lead">
      Typenote wants to read your Moodle courses on
      <strong class="host-name">moodle.tau.ac.il</strong>.
    </p>
    <p class="pending-detail">
      Files are only fetched while you're logged in. Click Allow on the next
      Chrome prompt to continue.
    </p>
    <div class="actions">
      <button type="button" class="primary">Allow</button>
      <button type="button" class="secondary">Cancel</button>
    </div>
  </section>`;

function frame({ body, caption }) {
  // A 1280x800 store canvas: soft background, a minimal browser toolbar with
  // the extension's pinned icon, and the popup anchored beneath it (drop
  // shadow) the way Chrome renders an opened action popup.
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    ${popupCss}
    /* scope: the embedded popup keeps its real 320px width via body{width} above,
       but we are not in <body>, so re-assert it on the card wrapper. */
    .canvas{
      width:1280px;height:800px;margin:0;position:relative;overflow:hidden;
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
      background:
        radial-gradient(1200px 600px at 80% -10%, #e8eefc 0%, rgba(232,238,252,0) 60%),
        radial-gradient(900px 500px at 0% 110%, #eef2f7 0%, rgba(238,242,247,0) 55%),
        linear-gradient(135deg,#f7f8fb 0%,#eef1f6 100%);
    }
    .toolbar{
      position:absolute;top:0;left:0;right:0;height:56px;background:#fff;
      border-bottom:1px solid #e6e8ee;display:flex;align-items:center;
      padding:0 18px;gap:14px;box-shadow:0 1px 0 rgba(16,24,40,.02);
    }
    .dots{display:flex;gap:7px}
    .dots i{width:12px;height:12px;border-radius:50%;display:block}
    .dots i:nth-child(1){background:#ff5f57}.dots i:nth-child(2){background:#febc2e}.dots i:nth-child(3){background:#28c840}
    .omnibox{flex:1;height:30px;background:#f1f3f6;border-radius:15px;display:flex;align-items:center;
      padding:0 14px;color:#7a8190;font-size:13px;max-width:560px}
    .pin{margin-left:auto;display:flex;align-items:center;gap:8px}
    .pin .btn{width:34px;height:34px;border-radius:8px;display:flex;align-items:center;justify-content:center;background:#f1f3f6}
    .pin .btn img{width:22px;height:22px;border-radius:5px}
    .popup-card{
      position:absolute;top:118px;right:80px;width:320px;background:#fff;
      border:1px solid #e6e8ee;border-radius:14px;overflow:hidden;
      transform:scale(1.45);transform-origin:top right;
      box-shadow:0 28px 70px rgba(16,24,40,.22),0 6px 16px rgba(16,24,40,.10);
    }
    .popup-card header,.popup-card section{width:320px}
    .headline{position:absolute;left:72px;top:300px;max-width:520px}
    .headline h2{font-size:44px;line-height:1.1;margin:0 0 16px;color:#101828;font-weight:700;letter-spacing:-.02em}
    .headline p{font-size:19px;line-height:1.5;color:#475467;margin:0}
    .headline .dotrow{display:flex;gap:10px;margin-top:28px}
    .headline .dotrow span{display:flex;align-items:center;gap:8px;font-size:15px;color:#344054;font-weight:500}
    .headline .dotrow b{width:8px;height:8px;border-radius:50%;background:#16a34a;display:inline-block}
  </style></head>
  <body style="margin:0">
    <div class="canvas">
      <div class="toolbar">
        <div class="dots"><i></i><i></i><i></i></div>
        <div class="omnibox">moodle.tau.ac.il/course/view.php?id=4821</div>
        <div class="pin"><div class="btn"><img src="${iconSrc}" alt=""></div></div>
      </div>
      <div class="headline">
        <h2>${caption.title}</h2>
        <p>${caption.sub}</p>
        <div class="dotrow">
          <span><b></b>No passwords stored</span>
          <span><b></b>Runs only on your click</span>
          <span><b></b>Moodle &amp; Typenote only</span>
        </div>
      </div>
      <div class="popup-card">${body}</div>
    </div>
  </body></html>`;
}

const shots = [
  {
    name: '01-extension-connected',
    html: frame({
      body: CONNECTED_BODY,
      caption: {
        title: 'Your Moodle, synced to Typenote',
        sub: 'See every Moodle site you’ve connected, and revoke any with one click. The extension only ever reads the sites you allow.',
      },
    }),
  },
  {
    name: '04-extension-permission',
    html: frame({
      body: PENDING_BODY,
      caption: {
        title: 'You’re always in control',
        sub: 'Typenote asks before it reads a new Moodle site. Files are fetched only while you’re logged in — nothing runs in the background.',
      },
    }),
  },
];

// Small promo tile — 440x280, required for the store listing's marketing slot.
const promoHtml = `<!doctype html><html><head><meta charset="utf-8"><style>
  *{box-sizing:border-box}
  .tile{width:440px;height:280px;margin:0;position:relative;overflow:hidden;
    font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
    background:radial-gradient(600px 300px at 85% -20%,#dbe6ff 0%,rgba(219,230,255,0) 60%),
      linear-gradient(135deg,#101828 0%,#1d2939 100%);
    color:#fff;padding:34px 36px;display:flex;flex-direction:column;justify-content:center}
  .tile .badge{display:flex;align-items:center;gap:12px;margin-bottom:20px}
  .tile .badge img{width:46px;height:46px;border-radius:11px;box-shadow:0 6px 18px rgba(0,0,0,.35)}
  .tile .badge span{font-size:15px;font-weight:600;letter-spacing:.01em;color:#cdd5e0}
  .tile h1{font-size:31px;line-height:1.12;margin:0 0 12px;font-weight:700;letter-spacing:-.02em}
  .tile p{font-size:15px;line-height:1.45;margin:0;color:#aeb8c7;max-width:340px}
</style></head><body style="margin:0"><div class="tile">
  <div class="badge"><img src="${iconSrc}" alt=""><span>Typenote Moodle Sync</span></div>
  <h1>Pull your Moodle course<br>into Typenote — one click.</h1>
  <p>Sections, files and documents, imported and ready for notes & AI study.</p>
</div></body></html>`;

// Marquee promo tile — 1400x560, the wide featured-placement banner. Embeds
// the real popup card (same popup.css) on a branded panel beside the headline.
const marqueeHtml = `<!doctype html><html><head><meta charset="utf-8"><style>
  ${popupCss}
  *{box-sizing:border-box}
  .m{width:1400px;height:560px;margin:0;position:relative;overflow:hidden;display:flex;align-items:center;
    font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#fff;
    background:radial-gradient(900px 520px at 92% -10%,#2b3a63 0%,rgba(43,58,99,0) 60%),
      radial-gradient(700px 400px at 0% 120%,#16203a 0%,rgba(22,32,58,0) 55%),
      linear-gradient(125deg,#0c1322 0%,#1d2939 100%)}
  .m .left{flex:1;padding:0 0 0 72px;max-width:720px}
  .m .badge{display:flex;align-items:center;gap:13px;margin-bottom:26px}
  .m .badge img{width:52px;height:52px;border-radius:12px;box-shadow:0 8px 22px rgba(0,0,0,.4)}
  .m .badge span{font-size:17px;font-weight:600;color:#cdd5e0}
  .m h1{font-size:52px;line-height:1.08;margin:0 0 18px;font-weight:700;letter-spacing:-.025em}
  .m h1 em{font-style:normal;color:#8ab4ff}
  .m p{font-size:21px;line-height:1.5;margin:0;color:#aeb8c7;max-width:540px}
  .m .dots{display:flex;gap:22px;margin-top:30px}
  .m .dots span{display:flex;align-items:center;gap:9px;font-size:15px;color:#c6cedb;font-weight:500}
  .m .dots b{width:8px;height:8px;border-radius:50%;background:#22c55e;display:inline-block}
  .m .right{flex:0 0 460px;display:flex;align-items:center;justify-content:center;height:100%}
  .m .popup-card{width:320px;background:#fff;color:#111;border-radius:14px;overflow:hidden;transform:scale(1.18);
    box-shadow:0 30px 80px rgba(0,0,0,.45),0 8px 20px rgba(0,0,0,.3)}
  .m .popup-card header h1{color:#111;font-size:14px;font-weight:600;line-height:1.2;letter-spacing:0}
  .m .popup-card header,.m .popup-card section{width:320px}
</style></head><body style="margin:0"><div class="m">
  <div class="left">
    <div class="badge"><img src="${iconSrc}" alt=""><span>Typenote Moodle Sync</span></div>
    <h1>Your Moodle course,<br><em>one click</em> into Typenote.</h1>
    <p>Import every section, file and document — organised by course, ready for note-taking and AI study.</p>
    <div class="dots">
      <span><b></b>No passwords stored</span>
      <span><b></b>Runs only on your click</span>
      <span><b></b>Moodle &amp; Typenote only</span>
    </div>
  </div>
  <div class="right"><div class="popup-card">${CONNECTED_BODY}</div></div>
</div></body></html>`;

const browser = await chromium.launch();
// Chrome Web Store requires screenshots at EXACTLY 1280x800 (or 640x400), the
// small promo tile at EXACTLY 440x280, and the marquee at EXACTLY 1400x560.
// deviceScaleFactor must be 1 so the PNG's pixel dimensions equal the CSS
// viewport — a 2x factor would emit double-size images and be rejected. The
// layout is vector text at native resolution, so 1x is already crisp.
const page = await browser.newPage({
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 1,
});

for (const s of shots) {
  await page.setContent(s.html, { waitUntil: 'networkidle' });
  const file = join(outDir, `${s.name}.png`);
  await page.screenshot({ path: file, clip: { x: 0, y: 0, width: 1280, height: 800 } });
  console.log(`\x1b[32m✔\x1b[0m ${file}`);
}

await page.setViewportSize({ width: 440, height: 280 });
await page.setContent(promoHtml, { waitUntil: 'networkidle' });
const promoFile = join(outDir, 'promo-tile.png');
await page.screenshot({ path: promoFile, clip: { x: 0, y: 0, width: 440, height: 280 } });
console.log(`\x1b[32m✔\x1b[0m ${promoFile}`);

await page.setViewportSize({ width: 1400, height: 560 });
await page.setContent(marqueeHtml, { waitUntil: 'networkidle' });
const marqueeFile = join(outDir, 'marquee-tile.png');
await page.screenshot({ path: marqueeFile, clip: { x: 0, y: 0, width: 1400, height: 560 } });
console.log(`\x1b[32m✔\x1b[0m ${marqueeFile}`);

await browser.close();
console.log(`\nStore assets written to ${outDir} (screenshots 1280x800, promo 440x280, marquee 1400x560).`);
