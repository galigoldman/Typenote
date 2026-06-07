// Generates the binary fixtures the videos need:
//   fixtures/eigen-diagram.png        — diagram image pasted in video 02
//   fixtures/lecture-3-eigenvalues.pdf — "Moodle" lecture PDF (video 04) / upload (video 06)
//   fixtures/problem-set-2.pdf         — second course PDF
// Rendered from styled HTML via Playwright so they look like real course
// materials, not lorem-ipsum placeholders.
//
// Usage: node demos/howto/make-fixtures.mjs
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { HOWTO_DIR } from './demo-env.mjs';

const outDir = path.join(HOWTO_DIR, 'fixtures');
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 560, height: 420 },
  deviceScaleFactor: 2,
});

// --- eigen-diagram.png: a hand-drawn-style eigenvector diagram ---------------
await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
  body{margin:0;font-family:Georgia,serif;background:#fff}
  .fig{width:560px;height:420px;position:relative;padding:18px;box-sizing:border-box}
  .fig h3{margin:0 0 6px;font-size:17px;color:#1d2939;font-style:italic}
  svg text{font-family:Georgia,serif}
</style></head><body><div class="fig">
  <h3>Fig 4.2 — Action of A on its eigenvectors</h3>
  <svg width="520" height="360" viewBox="0 0 520 360">
    <defs><marker id="a" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto">
      <path d="M0,0 L9,3 L0,6 z" fill="#1d4ed8"/></marker>
    <marker id="b" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto">
      <path d="M0,0 L9,3 L0,6 z" fill="#b91c1c"/></marker></defs>
    <line x1="40" y1="300" x2="490" y2="300" stroke="#94a3b8" stroke-width="1.5"/>
    <line x1="60" y1="330" x2="60" y2="30" stroke="#94a3b8" stroke-width="1.5"/>
    <line x1="60" y1="300" x2="240" y2="180" stroke="#1d4ed8" stroke-width="3" marker-end="url(#a)"/>
    <line x1="60" y1="300" x2="420" y2="60" stroke="#1d4ed8" stroke-width="3" stroke-dasharray="7 5" marker-end="url(#a)"/>
    <line x1="60" y1="300" x2="180" y2="320" stroke="#b91c1c" stroke-width="3" marker-end="url(#b)"/>
    <line x1="60" y1="300" x2="120" y2="310" stroke="#b91c1c" stroke-width="3" stroke-dasharray="7 5" marker-end="url(#b)"/>
    <text x="250" y="170" font-size="19" fill="#1d4ed8" font-style="italic">v&#8321;</text>
    <text x="430" y="55" font-size="19" fill="#1d4ed8" font-style="italic">Av&#8321; = 2v&#8321;</text>
    <text x="186" y="338" font-size="19" fill="#b91c1c" font-style="italic">v&#8322;</text>
    <text x="96" y="345" font-size="17" fill="#b91c1c" font-style="italic">Av&#8322; = &#189;v&#8322;</text>
  </svg>
</div></body></html>`);
await page.screenshot({
  path: path.join(outDir, 'eigen-diagram.png'),
  clip: { x: 0, y: 0, width: 560, height: 420 },
});
console.log('wrote fixtures/eigen-diagram.png');

// --- lecture PDFs -------------------------------------------------------------
function lectureHtml({ title, course, sections }) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body{font-family:Georgia,serif;color:#111;margin:56px 64px;line-height:1.55}
    .head{border-bottom:2px solid #1d2939;padding-bottom:10px;margin-bottom:26px}
    .head .course{font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#475467}
    h1{font-size:25px;margin:6px 0 0}
    h2{font-size:16px;margin:26px 0 8px;color:#1d2939}
    p{font-size:13.5px;margin:6px 0;text-align:justify}
    .eq{text-align:center;font-style:italic;font-size:15px;margin:14px 0}
  </style></head><body>
    <div class="head"><div class="course">${course}</div><h1>${title}</h1></div>
    ${sections.map(([h, body, eq]) => `<h2>${h}</h2><p>${body}</p>${eq ? `<div class="eq">${eq}</div>` : ''}`).join('')}
  </body></html>`;
}

await page.setContent(
  lectureHtml({
    course: 'Linear Algebra 1 · Spring 2026',
    title: 'Lecture 3 — Eigenvalues and Eigenvectors',
    sections: [
      [
        '1. Motivation',
        'Many linear transformations have privileged directions: vectors that the map merely stretches. Understanding these directions reduces a complicated matrix to a handful of scalars, and underpins diagonalization, stability analysis, and spectral methods.',
      ],
      [
        '2. Definitions',
        'Let A be an n×n matrix. A nonzero vector v is an eigenvector of A with eigenvalue λ when:',
        'A v = λ v',
      ],
      [
        '3. The characteristic polynomial',
        'Eigenvalues are exactly the roots of the characteristic polynomial, obtained by requiring that A − λI be singular:',
        'det(A − λI) = 0',
      ],
      [
        '4. Worked example',
        'For the 2×2 shear-and-stretch matrix discussed in class, the characteristic polynomial factors as (λ − 2)(λ − ½), giving eigenvalues 2 and ½ with independent eigenvectors v₁ and v₂. See Figure 4.2 in the lecture notes.',
      ],
      [
        '5. Exercises',
        'Compute the spectrum of the rotation matrix R(θ) and explain geometrically why no real eigenvectors exist for θ ∉ {0, π}. Then show that symmetric matrices always admit an orthonormal eigenbasis.',
      ],
    ],
  }),
);
await page.pdf({
  path: path.join(outDir, 'lecture-3-eigenvalues.pdf'),
  format: 'A4',
});
console.log('wrote fixtures/lecture-3-eigenvalues.pdf');

await page.setContent(
  lectureHtml({
    course: 'Linear Algebra 1 · Spring 2026',
    title: 'Problem Set 2 — Linear Maps',
    sections: [
      [
        'Problem 1',
        'Let T : ℝ³ → ℝ³ be the projection onto the plane x + y + z = 0. Write the matrix of T in the standard basis and verify T² = T.',
      ],
      [
        'Problem 2',
        'Determine whether the following maps are linear, and for each linear map compute its kernel and image: (a) f(x, y) = (x + 2y, 0); (b) g(x, y) = (xy, x − y).',
      ],
      [
        'Problem 3',
        'Suppose A is invertible and v is an eigenvector of A with eigenvalue λ. Show that v is an eigenvector of A⁻¹ and find its eigenvalue.',
        'A⁻¹ v = λ⁻¹ v',
      ],
      [
        'Problem 4 (bonus)',
        'Find a 2×2 matrix that has no real eigenvalues, and explain how this is consistent with the fundamental theorem of algebra.',
      ],
    ],
  }),
);
await page.pdf({ path: path.join(outDir, 'problem-set-2.pdf'), format: 'A4' });
console.log('wrote fixtures/problem-set-2.pdf');

await browser.close();
console.log('fixtures done');
