import { generateHTML } from '@tiptap/html';
import { Node, Extension, mergeAttributes } from '@tiptap/core';
import { preserveEmptyParagraphs } from './preserve-empty-paragraphs';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Link from '@tiptap/extension-link';
import Highlight from '@tiptap/extension-highlight';
import { TextStyle } from '@tiptap/extension-text-style';
import katex from 'katex';

import type { CanvasPage, TextBox } from '@/types/canvas';
import { PAGE_WIDTH, PAGE_HEIGHT } from '@/types/canvas';
import { strokeToSvgPath } from './stroke-to-svg';
import { renderBackgroundSvg } from './page-background-svg';

// ── Lightweight extension replicas for HTML serialization ──────────────
// These mirror the editor's custom extensions but without React/Plugin
// dependencies, since generateHTML() only needs schema + renderHTML().

const MathExpressionNode = Node.create({
  name: 'mathExpression',
  group: 'inline',
  inline: true,
  atom: true,
  addAttributes() {
    return {
      latex: {
        default: '',
        renderHTML: (attributes: Record<string, string>) => ({
          'data-latex': attributes.latex,
        }),
      },
      originalText: {
        default: '',
        renderHTML: (attributes: Record<string, string>) => ({
          'data-original-text': attributes.originalText,
        }),
      },
    };
  },
  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, { 'data-type': 'math-expression' }),
    ];
  },
});

const AutoDirectionAttrs = Extension.create({
  name: 'autoDirection',
  addGlobalAttributes() {
    return [
      {
        types: [
          'paragraph',
          'heading',
          'bulletList',
          'orderedList',
          'taskList',
          'listItem',
          'taskItem',
        ],
        attributes: {
          dir: {
            default: null,
            renderHTML: (attributes: Record<string, unknown>) => {
              if (!attributes.dir) return {};
              return { dir: attributes.dir };
            },
          },
        },
      },
    ];
  },
});

const INDENT_STEP = 40;

const IndentAttrs = Extension.create({
  name: 'indent',
  addGlobalAttributes() {
    return [
      {
        types: ['paragraph', 'heading'],
        attributes: {
          indent: {
            default: 0,
            renderHTML: (attributes: Record<string, unknown>) => {
              if (!attributes.indent || (attributes.indent as number) <= 0)
                return {};
              return {
                style: `margin-left: ${(attributes.indent as number) * INDENT_STEP}px`,
              };
            },
          },
        },
      },
    ];
  },
});

// ── Extensions list for generateHTML() ─────────────────────────────────

const extensions = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3] },
    // Disable extensions we configure separately to avoid duplicates
  }),
  Underline,
  TextAlign.configure({ types: ['heading', 'paragraph'] }),
  TaskList,
  TaskItem.configure({ nested: true }),
  Link.configure({ openOnClick: false }),
  Highlight.configure({ multicolor: true }),
  TextStyle,
  MathExpressionNode,
  AutoDirectionAttrs,
  IndentAttrs,
];

// ── KaTeX post-processing ──────────────────────────────────────────────

function renderMathNodes(html: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(
    `<div id="root">${html}</div>`,
    'text/html',
  );
  const mathSpans = doc.querySelectorAll('span[data-type="math-expression"]');

  mathSpans.forEach((span) => {
    const latex = span.getAttribute('data-latex') ?? '';
    try {
      span.innerHTML = katex.renderToString(latex, {
        throwOnError: false,
        displayMode: false,
      });
    } catch {
      // Fallback: show raw LaTeX in red
      span.innerHTML = `<span style="color: #dc2626; font-family: monospace;">${latex}</span>`;
    }
    span.removeAttribute('data-latex');
    span.removeAttribute('data-original-text');
  });

  return doc.getElementById('root')!.innerHTML;
}

// ── CSS ────────────────────────────────────────────────────────────────

const KATEX_CSS_URL =
  'https://cdn.jsdelivr.net/npm/katex@0.16.37/dist/katex.min.css';

function buildFontFaces(baseUrl: string): string {
  return `
    @font-face { font-family: 'GeistSans'; src: url('${baseUrl}/fonts/GeistSans-Regular.ttf') format('truetype'); font-weight: 400; font-style: normal; }
    @font-face { font-family: 'GeistSans'; src: url('${baseUrl}/fonts/GeistSans-Bold.ttf') format('truetype'); font-weight: 700; font-style: normal; }
    @font-face { font-family: 'GeistSans'; src: url('${baseUrl}/fonts/GeistSans-Italic.ttf') format('truetype'); font-weight: 400; font-style: italic; }
    @font-face { font-family: 'GeistMono'; src: url('${baseUrl}/fonts/GeistMono-Regular.ttf') format('truetype'); font-weight: 400; font-style: normal; }
    @font-face { font-family: 'Noto Sans Hebrew'; src: url('${baseUrl}/fonts/NotoSansHebrew-Regular.ttf') format('truetype'); font-weight: 400; font-style: normal; }
    @font-face { font-family: 'Noto Sans Hebrew'; src: url('${baseUrl}/fonts/NotoSansHebrew-Bold.ttf') format('truetype'); font-weight: 700; font-style: normal; }
  `;
}

const PROSE_CSS = `
  body {
    font-family: 'GeistSans', 'Noto Sans Hebrew', system-ui, sans-serif;
    font-size: 16px;
    line-height: 1.75;
    color: #000;
    margin: 0;
    padding: 0;
  }

  /* Headings */
  h1 { font-size: 2.25em; font-weight: 700; line-height: 1.1111; margin-top: 0; margin-bottom: 0.8889em; }
  h2 { font-size: 1.5em; font-weight: 700; line-height: 1.3333; margin-top: 2em; margin-bottom: 1em; }
  h3 { font-size: 1.25em; font-weight: 700; line-height: 1.6; margin-top: 1.6em; margin-bottom: 0.6em; }
  h1:first-child, h2:first-child, h3:first-child { margin-top: 0; }

  /* Paragraphs */
  p { margin-top: 0; margin-bottom: 1.25em; }

  /* Lists */
  ul, ol { padding-left: 1.625em; margin-top: 0; margin-bottom: 1.25em; }
  li { margin-top: 0.5em; margin-bottom: 0.5em; }
  li > p { margin-bottom: 0; }

  /* Task lists */
  ul[data-type="taskList"] { list-style: none; padding-left: 0; }
  li[data-type="taskItem"] { display: flex; align-items: flex-start; gap: 0.5em; }
  li[data-type="taskItem"]::before { content: '☐'; flex-shrink: 0; margin-top: 0.125em; }
  li[data-type="taskItem"][data-checked="true"]::before { content: '☑'; }

  /* Code */
  code { font-family: 'GeistMono', ui-monospace, monospace; font-size: 0.875em; background: #f3f4f6; padding: 0.2em 0.4em; border-radius: 0.25rem; }
  pre { background: #f3f4f6; padding: 0.875em 1.125em; border-radius: 0.375rem; overflow-x: auto; margin-top: 0; margin-bottom: 1.75em; }
  pre code { background: none; padding: 0; border-radius: 0; font-size: 0.875em; line-height: 1.7143; }

  /* Blockquote */
  blockquote { border-left: 3px solid #d1d5db; padding-left: 1em; margin-left: 0; margin-right: 0; font-style: italic; color: #374151; }

  /* Links */
  a { color: #2563eb; text-decoration: underline; }

  /* Horizontal rule */
  hr { border: none; border-top: 1px solid #e5e7eb; margin: 2em 0; }

  /* Highlights — force background colors to print */
  mark {
    padding: 0.125em 0;
    border-radius: 0.125rem;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  /* Underline */
  u { text-decoration: underline; }

  /* KaTeX: force LTR direction so math symbols are not mirrored in RTL text */
  .katex { direction: ltr; unicode-bidi: isolate; }
  .katex-display { margin: 1em 0; text-align: center; }

  /* Overflow protection */
  * { overflow-wrap: break-word; }
`;

const PRINT_CSS_A4 = `
  @page { size: A4; margin: 72pt; }
  @media print {
    h1, h2, h3 { break-after: avoid; }
    pre, blockquote, figure { break-inside: avoid; }
    mark, [style*="background"] {
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
  }
`;

// ── Public API ─────────────────────────────────────────────────────────

/**
 * Build a complete HTML document string for a text-only TipTap document.
 * The output is styled to match the editor and is ready for window.print().
 */
export function buildTextDocumentHtml(
  content: Record<string, unknown>,
  title: string,
): string {
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';

  // Generate HTML from TipTap JSON.
  // Preserve empty paragraphs (TipTap's generateHTML strips them by default).
  let bodyHtml: string;
  try {
    bodyHtml = generateHTML(
      preserveEmptyParagraphs(content) as Record<string, unknown>,
      extensions,
    );
  } catch {
    // Fallback for empty or invalid content
    bodyHtml = '';
  }

  // Post-process: render KaTeX math
  bodyHtml = renderMathNodes(bodyHtml);

  return buildDocument({ title, bodyHtml, baseUrl, printCss: PRINT_CSS_A4 });
}

/**
 * Wrap content HTML in a full HTML document with all required styles.
 */
function buildDocument(opts: {
  title: string;
  bodyHtml: string;
  baseUrl: string;
  printCss: string;
  extraCss?: string;
}): string {
  const { title, bodyHtml, baseUrl, printCss, extraCss } = opts;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <base href="${baseUrl}/">
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" href="${KATEX_CSS_URL}" crossorigin="anonymous">
  <style>
    ${buildFontFaces(baseUrl)}
    ${PROSE_CSS}
    ${printCss}
    ${extraCss ?? ''}
  </style>
</head>
<body dir="auto">
  <div class="content">
    ${bodyHtml}
  </div>
</body>
</html>`;
}

// ── Canvas page rendering ──────────────────────────────────────────────

// Canvas coordinates are CSS pixels (96 DPI). Use px everywhere for consistency.
const PRINT_CSS_CANVAS = `
  @page { size: ${PAGE_WIDTH}px ${PAGE_HEIGHT}px; margin: 0; }
  @media print {
    .canvas-page { break-after: page; }
    .canvas-page:last-child { break-after: auto; }
    mark, [style*="background"] {
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
  }
`;

/**
 * Build HTML for canvas pages with strokes, text boxes, and backgrounds.
 */
export function buildCanvasPageHtml(
  pages: CanvasPage[],
  canvasType: string,
  title: string,
): string {
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const sorted = [...pages].sort((a, b) => a.order - b.order);

  const pagesHtml = sorted
    .map((page) => {
      const bgType = page.pageType ?? canvasType ?? 'blank';
      const bgSvg = renderBackgroundSvg(bgType, PAGE_WIDTH, PAGE_HEIGHT);

      // Render strokes as SVG paths
      const strokePaths = page.strokes
        .map((s) => strokeToSvgPath(s))
        .filter(Boolean)
        .join('\n');

      // Render text boxes as positioned divs
      const textBoxesHtml = page.textBoxes
        .sort((a, b) => a.zIndex - b.zIndex)
        .map((tb) => renderTextBox(tb))
        .join('\n');

      // Render flow content if present
      let flowHtml = '';
      if (page.flowContent) {
        try {
          flowHtml = renderMathNodes(
            generateHTML(
              preserveEmptyParagraphs(page.flowContent) as Record<
                string,
                unknown
              >,
              extensions,
            ),
          );
        } catch {
          flowHtml = '';
        }
      }

      return `
      <div class="canvas-page" style="position: relative; width: ${PAGE_WIDTH}px; height: ${PAGE_HEIGHT}px; overflow: hidden; background: white;">
        <svg viewBox="0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none;">
          ${bgSvg}
          ${strokePaths}
        </svg>
        ${textBoxesHtml}
        ${flowHtml && page.textBoxes.length === 0 ? `<div style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; padding: 16px; box-sizing: border-box; pointer-events: none;">${flowHtml}</div>` : ''}
      </div>`;
    })
    .join('\n');

  return buildDocument({
    title,
    bodyHtml: pagesHtml,
    baseUrl,
    printCss: PRINT_CSS_CANVAS,
    extraCss: `
      .canvas-page { page-break-after: always; }
      .canvas-page:last-child { page-break-after: auto; }
    `,
  });
}

function renderTextBox(tb: TextBox): string {
  let contentHtml = '';
  if (tb.content) {
    try {
      // Ensure content is wrapped in a doc node for generateHTML
      const content =
        (tb.content as Record<string, unknown>).type === 'doc'
          ? tb.content
          : { type: 'doc', content: [tb.content] };
      contentHtml = renderMathNodes(
        generateHTML(
          preserveEmptyParagraphs(content) as Record<string, unknown>,
          extensions,
        ),
      );
    } catch (e) {
      // Show error + content snapshot for debugging
      const errMsg = e instanceof Error ? e.message : String(e);
      const contentSnap = JSON.stringify(tb.content).slice(0, 200);
      contentHtml = `<p style="color: red; font-size: 8px; word-break: break-all;">[${errMsg}] content: ${escapeHtml(contentSnap)}</p>`;
    }
  }

  const scale = tb.fontScale ?? 1;
  const fontSize = scale !== 1 ? `font-size: ${scale}em;` : '';

  return `<div style="position: absolute; left: ${tb.x}px; top: ${tb.y}px; width: ${tb.width}px; height: ${tb.height}px; ${fontSize} overflow: visible; box-sizing: border-box; z-index: ${tb.zIndex};">
    ${contentHtml}
  </div>`;
}

// ── Mixed document rendering ───────────────────────────────────────────

const PRINT_CSS_MIXED = `
  @media print {
    .canvas-page { break-after: page; }
    h1, h2, h3 { break-after: avoid; }
    pre, blockquote, figure { break-inside: avoid; }
    mark, [style*="background"] {
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
  }
`;

/**
 * Build HTML for mixed documents: canvas pages followed by text content.
 */
export function buildMixedDocumentHtml(
  pages: CanvasPage[],
  content: Record<string, unknown>,
  canvasType: string,
  title: string,
): string {
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const sorted = [...pages].sort((a, b) => a.order - b.order);

  // Canvas pages
  const canvasPagesHtml = sorted
    .map((page) => {
      const bgType = page.pageType ?? canvasType ?? 'blank';
      const bgSvg = renderBackgroundSvg(bgType, PAGE_WIDTH, PAGE_HEIGHT);
      const strokePaths = page.strokes
        .map((s) => strokeToSvgPath(s))
        .filter(Boolean)
        .join('\n');
      const textBoxesHtml = page.textBoxes
        .sort((a, b) => a.zIndex - b.zIndex)
        .map((tb) => renderTextBox(tb))
        .join('\n');
      let flowHtml = '';
      if (page.flowContent) {
        try {
          flowHtml = renderMathNodes(
            generateHTML(
              preserveEmptyParagraphs(page.flowContent) as Record<
                string,
                unknown
              >,
              extensions,
            ),
          );
        } catch {
          flowHtml = '';
        }
      }

      return `
      <div class="canvas-page" style="position: relative; width: ${PAGE_WIDTH}px; height: ${PAGE_HEIGHT}px; overflow: hidden; background: white;">
        <svg viewBox="0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none;">
          ${bgSvg}
          ${strokePaths}
        </svg>
        ${textBoxesHtml}
        ${flowHtml && page.textBoxes.length === 0 ? `<div style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; padding: 16px; box-sizing: border-box;">${flowHtml}</div>` : ''}
      </div>`;
    })
    .join('\n');

  // Text content
  let textHtml = '';
  try {
    textHtml = renderMathNodes(
      generateHTML(
        preserveEmptyParagraphs(content) as Record<string, unknown>,
        extensions,
      ),
    );
  } catch {
    textHtml = '';
  }

  const bodyHtml = `
    ${canvasPagesHtml}
    ${textHtml ? `<div class="text-content" style="padding: 72pt;">${textHtml}</div>` : ''}
  `;

  return buildDocument({
    title,
    bodyHtml,
    baseUrl,
    printCss: PRINT_CSS_MIXED,
  });
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
