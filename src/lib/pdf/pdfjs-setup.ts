import * as pdfjsLib from 'pdfjs-dist';

// Configure the PDF.js worker using the CDN matching the installed version.
// This avoids bundling the worker into the Next.js build and prevents
// issues with Webpack 5's worker loading.
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

export { pdfjsLib };
