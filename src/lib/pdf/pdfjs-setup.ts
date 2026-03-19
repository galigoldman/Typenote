// Polyfill Map.getOrInsertComputed for Safari < 18.4 (used by pdfjs-dist 5.5)
if (
  typeof Map !== 'undefined' &&
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  !(Map.prototype as any).getOrInsertComputed
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (Map.prototype as any).getOrInsertComputed = function <K, V>(
    this: Map<K, V>,
    key: K,
    callbackfn: (key: K) => V,
  ): V {
    if (this.has(key)) return this.get(key) as V;
    const value = callbackfn(key);
    this.set(key, value);
    return value;
  };
}

import * as pdfjsLib from 'pdfjs-dist';

// Configure the PDF.js worker using the CDN matching the installed version.
// This avoids bundling the worker into the Next.js build and prevents
// issues with Webpack 5's worker loading.
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

export { pdfjsLib };
