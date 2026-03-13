import type { jsPDF } from 'jspdf';

// ---------------------------------------------------------------------------
// TipTap JSON types (mirrors the ProseMirror document model)
// ---------------------------------------------------------------------------

interface TipTapMark {
  type: string; // 'bold', 'italic', 'underline', 'code', 'link', 'highlight'
  attrs?: Record<string, unknown>;
}

interface TipTapNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TipTapNode[];
  marks?: TipTapMark[];
  text?: string;
}

// ---------------------------------------------------------------------------
// Constants — defined in CSS pixel values from Tailwind prose-base.
//
// Why CSS pixels?  Canvas pages use 794×1123 as both CSS pixels (in the
// editor) and as PDF points (in the jsPDF coordinate space).  By using the
// same numeric values for font sizes and spacing, the *proportion* of every
// measurement to the page dimensions is identical in both contexts:
//
//   16 / 794  (font/page in PDF)  =  16 / 794  (font/page in editor)
//
// For text-only documents rendered on standard A4 (595.28 × 841.89 pt),
// a scale factor of 0.75 (= 72/96, the CSS px → PDF pt conversion) is
// applied so that proportions are also preserved:
//
//   12 / 595  ≈  16 / 794  ≈  2.01%
// ---------------------------------------------------------------------------

/** Base paragraph font size — matches prose-base 1rem = 16px */
const BASE_FONT_SIZE = 16;

/** Heading font sizes — prose-base em values × 16px */
const BASE_HEADING_SIZES: Record<number, number> = { 1: 36, 2: 24, 3: 20 };

/** Code block / inline code font size — prose-base 0.875em = 14px */
const BASE_CODE_SIZE = 14;

/** Inline code shrink factor relative to surrounding text */
const INLINE_CODE_SIZE_FACTOR = 0.85;

/** Line-height multiplier for paragraphs — prose-base */
const LINE_HEIGHT_PARAGRAPH = 1.75;

/** Line-height multipliers for headings — prose-base per-level values */
const LINE_HEIGHT_HEADINGS: Record<number, number> = {
  1: 1.1111,
  2: 1.3333,
  3: 1.6,
};

/** Line-height multiplier for code blocks — prose-base pre */
const LINE_HEIGHT_CODE = 1.7143;

/**
 * Spacing below paragraphs — prose-base margin-bottom 1.25em = 20px.
 * Because our renderer only applies bottom-margin (no top-margin on
 * paragraphs), this value equals the collapsed CSS margin between two
 * consecutive paragraphs.
 */
const BASE_PARAGRAPH_SPACING = 20;

/**
 * Spacing above headings — accounts for CSS margin-collapsing.
 * Values = heading margin-top − preceding paragraph bottom margin (20px).
 * h1 margin-top is 0 in prose-base (typically the first element).
 * h2 margin-top is 2em (48px at 24px font) → 48 − 20 = 28.
 * h3 margin-top is 1.6em (32px at 20px font) → 32 − 20 = 12.
 */
const BASE_HEADING_SPACING_ABOVE: Record<number, number> = {
  1: 0,
  2: 28,
  3: 12,
};

/**
 * Spacing below headings — matches the collapsed margin between a heading
 * and the following paragraph.
 * h1 margin-bottom 0.889em (32px at 36px) vs paragraph margin-top 20px → max = 32.
 * h2 margin-bottom 1em (24px at 24px) vs paragraph margin-top 20px → max = 24.
 * h3 margin-bottom 0.6em (12px at 20px) vs paragraph margin-top 20px → max = 20.
 */
const BASE_HEADING_SPACING_BELOW: Record<number, number> = {
  1: 32,
  2: 24,
  3: 20,
};

/** List indent per nesting level — prose-base paddingLeft 1.625em ≈ 26px */
const BASE_LIST_INDENT = 26;

/** Horizontal padding inside a code block — prose-base pre paddingLeft/Right */
const BASE_CODE_PAD_X = 16;

/** Vertical padding inside a code block — prose-base pre paddingTop/Bottom */
const BASE_CODE_PAD_Y = 12;

/** Link text color */
const LINK_COLOR = { r: 37, g: 99, b: 235 }; // #2563eb

/** Highlight background color (default yellow) */
const HIGHLIGHT_DEFAULT = { r: 254, g: 240, b: 138 }; // #fef08a

/** Code block background */
const CODE_BLOCK_BG = { r: 243, g: 244, b: 246 }; // #f3f4f6

/** Standard text color */
const TEXT_COLOR = { r: 0, g: 0, b: 0 };

// ---------------------------------------------------------------------------
// Scaled configuration — computed once per render call
// ---------------------------------------------------------------------------

interface RenderConfig {
  paragraphSize: number;
  headingSizes: Record<number, number>;
  codeSize: number;
  paragraphSpacing: number;
  headingSpacingAbove: Record<number, number>;
  headingSpacingBelow: Record<number, number>;
  listIndent: number;
  codePadX: number;
  codePadY: number;
}

function createConfig(scale: number): RenderConfig {
  return {
    paragraphSize: BASE_FONT_SIZE * scale,
    headingSizes: {
      1: BASE_HEADING_SIZES[1] * scale,
      2: BASE_HEADING_SIZES[2] * scale,
      3: BASE_HEADING_SIZES[3] * scale,
    },
    codeSize: BASE_CODE_SIZE * scale,
    paragraphSpacing: BASE_PARAGRAPH_SPACING * scale,
    headingSpacingAbove: {
      1: BASE_HEADING_SPACING_ABOVE[1] * scale,
      2: BASE_HEADING_SPACING_ABOVE[2] * scale,
      3: BASE_HEADING_SPACING_ABOVE[3] * scale,
    },
    headingSpacingBelow: {
      1: BASE_HEADING_SPACING_BELOW[1] * scale,
      2: BASE_HEADING_SPACING_BELOW[2] * scale,
      3: BASE_HEADING_SPACING_BELOW[3] * scale,
    },
    listIndent: BASE_LIST_INDENT * scale,
    codePadX: BASE_CODE_PAD_X * scale,
    codePadY: BASE_CODE_PAD_Y * scale,
  };
}

/** Module-level config set at the public entry points before rendering. */
let cfg: RenderConfig = createConfig(1);

// ---------------------------------------------------------------------------
// Hex color parsing helper
// ---------------------------------------------------------------------------

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const cleaned = hex.replace('#', '');
  let r = 0,
    g = 0,
    b = 0;

  if (cleaned.length === 3) {
    r = parseInt(cleaned[0] + cleaned[0], 16);
    g = parseInt(cleaned[1] + cleaned[1], 16);
    b = parseInt(cleaned[2] + cleaned[2], 16);
  } else if (cleaned.length === 6) {
    r = parseInt(cleaned.substring(0, 2), 16);
    g = parseInt(cleaned.substring(2, 4), 16);
    b = parseInt(cleaned.substring(4, 6), 16);
  }

  return { r, g, b };
}

// ---------------------------------------------------------------------------
// Mark analysis helpers
// ---------------------------------------------------------------------------

interface ResolvedMarks {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  code: boolean;
  link: string | null;
  highlight: { r: number; g: number; b: number } | null;
}

function resolveMarks(marks?: TipTapMark[]): ResolvedMarks {
  const result: ResolvedMarks = {
    bold: false,
    italic: false,
    underline: false,
    code: false,
    link: null,
    highlight: null,
  };

  if (!marks) return result;

  for (const mark of marks) {
    switch (mark.type) {
      case 'bold':
        result.bold = true;
        break;
      case 'italic':
        result.italic = true;
        break;
      case 'underline':
        result.underline = true;
        break;
      case 'code':
        result.code = true;
        break;
      case 'link':
        result.link = (mark.attrs?.href as string) ?? null;
        result.underline = true;
        break;
      case 'highlight':
        if (mark.attrs?.color && typeof mark.attrs.color === 'string') {
          result.highlight = hexToRgb(mark.attrs.color);
        } else {
          result.highlight = HIGHLIGHT_DEFAULT;
        }
        break;
    }
  }

  return result;
}

/**
 * Determines the jsPDF font family and style string from resolved marks.
 */
function fontStyleFromMarks(resolved: ResolvedMarks): {
  family: string;
  style: string;
} {
  if (resolved.code) {
    return { family: 'GeistMono', style: 'normal' };
  }

  let style = 'normal';
  if (resolved.bold && resolved.italic) {
    // jsPDF may not have a bold-italic variant; fall back to bold
    style = 'bold';
  } else if (resolved.bold) {
    style = 'bold';
  } else if (resolved.italic) {
    style = 'italic';
  }

  return { family: 'GeistSans', style };
}

// ---------------------------------------------------------------------------
// Text extraction helpers
// ---------------------------------------------------------------------------

/**
 * Recursively extracts the plain-text content of a node (and its children).
 * Used by measureNodeHeight where we need to know total text length for wrapping.
 */
function extractPlainText(node: TipTapNode): string {
  if (node.text != null) return node.text;

  if (!node.content) return '';

  return node.content.map(extractPlainText).join('');
}

/**
 * Collects all inline child nodes (text, mathExpression, etc.) from a block
 * node's content array, flattening nested inline structures.
 */
function collectInlineNodes(nodes?: TipTapNode[]): TipTapNode[] {
  if (!nodes) return [];

  const result: TipTapNode[] = [];
  for (const node of nodes) {
    if (node.type === 'text' || node.type === 'mathExpression') {
      result.push(node);
    } else if (node.content) {
      // Recursively collect from wrapper nodes (e.g. mark wrappers)
      result.push(...collectInlineNodes(node.content));
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Inline text rendering
// ---------------------------------------------------------------------------

/**
 * Renders an array of inline nodes (text nodes with marks, math expressions)
 * at the given position, wrapping within `maxWidth`.
 *
 * Returns the y-position after the last line of rendered text.
 */
function renderInlineContent(
  doc: jsPDF,
  nodes: TipTapNode[],
  x: number,
  y: number,
  maxWidth: number,
  baseFontSize: number,
  lineHeightFactor: number = LINE_HEIGHT_PARAGRAPH,
): number {
  const lineHeight = baseFontSize * lineHeightFactor;

  // For simple rendering, concatenate text segments and handle marks per segment.
  // We process each text node individually, advancing the cursor.

  let cursorX = x;
  let cursorY = y;

  for (const node of nodes) {
    // Handle math expression inline nodes
    if (node.type === 'mathExpression') {
      const latex = (node.attrs?.latex as string) ?? '';
      if (latex) {
        // Render math as a fallback LaTeX string in italic mono
        // (A dedicated math-renderer module can be integrated here once available)
        doc.setFont('GeistMono', 'normal');
        const mathSize = baseFontSize * 0.9;
        doc.setFontSize(mathSize);
        const mathText = latex;
        const dims = doc.getTextDimensions(mathText);

        // Wrap to next line if needed
        if (cursorX + dims.w > x + maxWidth && cursorX > x) {
          cursorX = x;
          cursorY += lineHeight;
        }

        doc.text(mathText, cursorX, cursorY);
        cursorX += dims.w;

        // Restore font
        doc.setFont('GeistSans', 'normal');
        doc.setFontSize(baseFontSize);
      }
      continue;
    }

    // Regular text node
    if (node.type !== 'text' || !node.text) continue;

    const resolved = resolveMarks(node.marks);
    const { family, style } = fontStyleFromMarks(resolved);
    const fontSize = resolved.code
      ? baseFontSize * INLINE_CODE_SIZE_FACTOR
      : baseFontSize;

    doc.setFont(family, style);
    doc.setFontSize(fontSize);

    // Set text color
    if (resolved.link) {
      doc.setTextColor(LINK_COLOR.r, LINK_COLOR.g, LINK_COLOR.b);
    } else {
      doc.setTextColor(TEXT_COLOR.r, TEXT_COLOR.g, TEXT_COLOR.b);
    }

    // Split the text into words for manual wrapping
    const words = node.text.split(/( +)/); // preserve spaces as separate tokens

    for (const word of words) {
      if (word.length === 0) continue;

      const dims = doc.getTextDimensions(word);

      // Check if we need to wrap to the next line
      if (cursorX + dims.w > x + maxWidth && cursorX > x) {
        cursorX = x;
        cursorY += lineHeight;
      }

      // Draw highlight background behind text
      if (resolved.highlight) {
        doc.setFillColor(
          resolved.highlight.r,
          resolved.highlight.g,
          resolved.highlight.b,
        );
        doc.rect(cursorX, cursorY - fontSize * 0.8, dims.w, fontSize, 'F');
      }

      // Draw the text
      doc.text(word, cursorX, cursorY);

      // Draw underline
      if (resolved.underline) {
        const underlineY = cursorY + fontSize * 0.15;
        const currentColor = resolved.link ? LINK_COLOR : TEXT_COLOR;
        doc.setDrawColor(currentColor.r, currentColor.g, currentColor.b);
        doc.setLineWidth(0.5);
        doc.line(cursorX, underlineY, cursorX + dims.w, underlineY);
      }

      // Add clickable link annotation
      if (resolved.link) {
        doc.link(cursorX, cursorY - fontSize * 0.8, dims.w, fontSize, {
          url: resolved.link,
        });
      }

      cursorX += dims.w;
    }

    // Reset text color to black after each node
    doc.setTextColor(TEXT_COLOR.r, TEXT_COLOR.g, TEXT_COLOR.b);
  }

  // Move past the last line
  cursorY += lineHeight;

  // Restore defaults
  doc.setFont('GeistSans', 'normal');
  doc.setFontSize(cfg.paragraphSize);

  return cursorY;
}

// ---------------------------------------------------------------------------
// Node-type renderers
// ---------------------------------------------------------------------------

function renderHeading(
  doc: jsPDF,
  node: TipTapNode,
  x: number,
  y: number,
  width: number,
): number {
  const level = (node.attrs?.level as number) ?? 1;
  const fontSize = cfg.headingSizes[level] ?? cfg.headingSizes[1];
  const lhFactor = LINE_HEIGHT_HEADINGS[level] ?? LINE_HEIGHT_PARAGRAPH;

  let cursorY = y + (cfg.headingSpacingAbove[level] ?? 0);

  doc.setFont('GeistSans', 'bold');
  doc.setFontSize(fontSize);

  const inlines = collectInlineNodes(node.content);
  if (inlines.length > 0) {
    cursorY = renderInlineContent(doc, inlines, x, cursorY, width, fontSize, lhFactor);
  } else {
    // Heading with no inline content — just advance past it
    cursorY += fontSize * lhFactor;
  }

  cursorY += cfg.headingSpacingBelow[level] ?? 0;

  // Restore defaults
  doc.setFont('GeistSans', 'normal');
  doc.setFontSize(cfg.paragraphSize);

  return cursorY;
}

function renderParagraph(
  doc: jsPDF,
  node: TipTapNode,
  x: number,
  y: number,
  width: number,
): number {
  doc.setFont('GeistSans', 'normal');
  doc.setFontSize(cfg.paragraphSize);

  const inlines = collectInlineNodes(node.content);
  let cursorY = y;

  if (inlines.length > 0) {
    cursorY = renderInlineContent(doc, inlines, x, cursorY, width, cfg.paragraphSize);
  } else {
    // Empty paragraph — still takes up one line of space
    cursorY += cfg.paragraphSize * LINE_HEIGHT_PARAGRAPH;
  }

  cursorY += cfg.paragraphSpacing;
  return cursorY;
}

function renderBulletList(
  doc: jsPDF,
  node: TipTapNode,
  x: number,
  y: number,
  width: number,
  depth: number,
): number {
  let cursorY = y;

  if (!node.content) return cursorY;

  for (const listItem of node.content) {
    if (listItem.type !== 'listItem') continue;
    cursorY = renderListItem(doc, listItem, x, cursorY, width, depth, 'bullet');
  }

  return cursorY;
}

function renderOrderedList(
  doc: jsPDF,
  node: TipTapNode,
  x: number,
  y: number,
  width: number,
  depth: number,
): number {
  let cursorY = y;

  if (!node.content) return cursorY;

  const startNumber = (node.attrs?.start as number) ?? 1;

  for (let i = 0; i < node.content.length; i++) {
    const listItem = node.content[i];
    if (listItem.type !== 'listItem') continue;
    cursorY = renderListItem(
      doc,
      listItem,
      x,
      cursorY,
      width,
      depth,
      'ordered',
      startNumber + i,
    );
  }

  return cursorY;
}

function renderListItem(
  doc: jsPDF,
  node: TipTapNode,
  x: number,
  y: number,
  width: number,
  depth: number,
  listType: 'bullet' | 'ordered' | 'task',
  index?: number,
  checked?: boolean,
): number {
  const indent = x + depth * cfg.listIndent;
  const contentIndent = indent + cfg.listIndent;
  const contentWidth = width - (depth + 1) * cfg.listIndent;
  let cursorY = y;

  // Draw the marker
  doc.setFont('GeistSans', 'normal');
  doc.setFontSize(cfg.paragraphSize);

  let marker: string;
  if (listType === 'bullet') {
    marker = '\u2022'; // bullet: •
  } else if (listType === 'task') {
    marker = checked ? '\u2611' : '\u2610'; // ☑ or ☐
  } else {
    marker = `${index ?? 1}.`;
  }

  doc.text(marker, indent, cursorY);

  // Render child content (paragraphs and nested lists)
  if (node.content) {
    let firstBlock = true;
    for (const child of node.content) {
      if (child.type === 'paragraph') {
        const inlines = collectInlineNodes(child.content);
        if (inlines.length > 0) {
          if (firstBlock) {
            // First paragraph renders on the same line as the marker
            cursorY = renderInlineContent(
              doc,
              inlines,
              contentIndent,
              cursorY,
              contentWidth,
              cfg.paragraphSize,
            );
            firstBlock = false;
          } else {
            cursorY = renderInlineContent(
              doc,
              inlines,
              contentIndent,
              cursorY,
              contentWidth,
              cfg.paragraphSize,
            );
          }
        } else {
          cursorY += cfg.paragraphSize * LINE_HEIGHT_PARAGRAPH;
          firstBlock = false;
        }
        cursorY += cfg.paragraphSpacing;
      } else if (child.type === 'bulletList') {
        firstBlock = false;
        cursorY = renderBulletList(doc, child, x, cursorY, width, depth + 1);
      } else if (child.type === 'orderedList') {
        firstBlock = false;
        cursorY = renderOrderedList(doc, child, x, cursorY, width, depth + 1);
      } else if (child.type === 'taskList') {
        firstBlock = false;
        cursorY = renderTaskList(doc, child, x, cursorY, width, depth + 1);
      } else {
        firstBlock = false;
        cursorY = renderNode(doc, child, contentIndent, cursorY, contentWidth, depth + 1);
      }
    }
  }

  return cursorY;
}

function renderTaskList(
  doc: jsPDF,
  node: TipTapNode,
  x: number,
  y: number,
  width: number,
  depth: number,
): number {
  let cursorY = y;

  if (!node.content) return cursorY;

  for (const taskItem of node.content) {
    if (taskItem.type !== 'taskItem') continue;
    const isChecked = (taskItem.attrs?.checked as boolean) ?? false;
    cursorY = renderListItem(
      doc,
      taskItem,
      x,
      cursorY,
      width,
      depth,
      'task',
      undefined,
      isChecked,
    );
  }

  return cursorY;
}

function renderCodeBlock(
  doc: jsPDF,
  node: TipTapNode,
  x: number,
  y: number,
  width: number,
): number {
  doc.setFont('GeistMono', 'normal');
  doc.setFontSize(cfg.codeSize);

  const text = extractPlainText(node);
  const lineHeight = cfg.codeSize * LINE_HEIGHT_CODE;

  // Wrap text to fit within the available width (minus padding)
  const innerWidth = width - cfg.codePadX * 2;
  const lines: string[] = text
    ? (doc.splitTextToSize(text, innerWidth) as string[])
    : [''];

  // Calculate the background rectangle dimensions
  const bgHeight = lines.length * lineHeight + cfg.codePadY * 2;

  // Draw background rectangle
  doc.setFillColor(CODE_BLOCK_BG.r, CODE_BLOCK_BG.g, CODE_BLOCK_BG.b);
  doc.rect(x, y, width, bgHeight, 'F');

  // Draw text lines
  doc.setTextColor(TEXT_COLOR.r, TEXT_COLOR.g, TEXT_COLOR.b);
  let lineY = y + cfg.codePadY + cfg.codeSize;

  for (const line of lines) {
    doc.text(line, x + cfg.codePadX, lineY);
    lineY += lineHeight;
  }

  // Restore defaults
  doc.setFont('GeistSans', 'normal');
  doc.setFontSize(cfg.paragraphSize);

  return y + bgHeight + cfg.paragraphSpacing;
}

function renderBlockquote(
  doc: jsPDF,
  node: TipTapNode,
  x: number,
  y: number,
  width: number,
  depth: number,
): number {
  const barX = x;
  const contentX = x + 16;
  const contentWidth = width - 16;
  let cursorY = y;

  // Track starting Y for the vertical bar
  const startY = y;

  // Render children (paragraphs inside the blockquote)
  if (node.content) {
    for (const child of node.content) {
      cursorY = renderNode(doc, child, contentX, cursorY, contentWidth, depth);
    }
  }

  // Draw the left border bar
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(2);
  doc.line(barX, startY, barX, cursorY - cfg.paragraphSpacing);

  return cursorY;
}

function renderHorizontalRule(
  _doc: jsPDF,
  _node: TipTapNode,
  x: number,
  y: number,
  width: number,
): number {
  const ruleY = y + 8;

  _doc.setDrawColor(200, 200, 200);
  _doc.setLineWidth(0.5);
  _doc.line(x, ruleY, x + width, ruleY);

  return ruleY + 8 + cfg.paragraphSpacing;
}

// ---------------------------------------------------------------------------
// Central node dispatcher
// ---------------------------------------------------------------------------

function renderNode(
  doc: jsPDF,
  node: TipTapNode,
  x: number,
  y: number,
  width: number,
  depth: number = 0,
): number {
  switch (node.type) {
    case 'heading':
      return renderHeading(doc, node, x, y, width);

    case 'paragraph':
      return renderParagraph(doc, node, x, y, width);

    case 'bulletList':
      return renderBulletList(doc, node, x, y, width, depth);

    case 'orderedList':
      return renderOrderedList(doc, node, x, y, width, depth);

    case 'taskList':
      return renderTaskList(doc, node, x, y, width, depth);

    case 'codeBlock':
      return renderCodeBlock(doc, node, x, y, width);

    case 'blockquote':
      return renderBlockquote(doc, node, x, y, width, depth);

    case 'horizontalRule':
      return renderHorizontalRule(doc, node, x, y, width);

    default:
      // Unknown node type — attempt to render children if present
      if (node.content) {
        let cursorY = y;
        for (const child of node.content) {
          cursorY = renderNode(doc, child, x, cursorY, width, depth);
        }
        return cursorY;
      }
      return y;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * CSS-pixel to PDF-point conversion factor (72 pt/inch ÷ 96 px/inch).
 * Use this as the `scale` parameter when rendering onto standard A4 pages
 * whose coordinates are in PDF points rather than CSS pixels.
 */
export const PX_TO_PT = 72 / 96;

/**
 * Renders TipTap JSON content onto a jsPDF document at the specified position.
 *
 * Walks the top-level `content` array of the document node, rendering each
 * block node (heading, paragraph, list, code block, etc.) sequentially. Text
 * marks (bold, italic, underline, code, link, highlight) are applied inline.
 *
 * @param doc     - The jsPDF instance to render into (fonts must already be loaded)
 * @param content - A TipTap JSON document (with `type: 'doc'` and `content` array)
 * @param x       - Left x-coordinate where rendering begins
 * @param y       - Top y-coordinate where rendering begins (baseline of first line)
 * @param width   - Maximum width available for text wrapping
 * @param scale   - Multiplier applied to font sizes and spacing to maintain
 *                  proportionality across different page sizes.  Use 1 (default)
 *                  for canvas pages (794×1123 coordinate space) and {@link PX_TO_PT}
 *                  for standard A4 pages (595×842 pt coordinate space).
 * @returns The y-position immediately after the last rendered element
 */
export function renderTiptapContent(
  doc: jsPDF,
  content: Record<string, unknown>,
  x: number,
  y: number,
  width: number,
  scale: number = 1,
): number {
  cfg = createConfig(scale);

  const tiptapDoc = content as unknown as { type: string; content?: TipTapNode[] };

  if (!tiptapDoc.content || !Array.isArray(tiptapDoc.content)) {
    return y;
  }

  let cursorY = y;

  for (const node of tiptapDoc.content) {
    cursorY = renderNode(doc, node, x, cursorY, width, 0);
  }

  return cursorY;
}

/**
 * Calculates the height a TipTap node would occupy when rendered.
 *
 * This is used by the text document paginator to determine whether a node
 * fits on the current page or needs to start on the next page. It mirrors
 * the rendering logic but only tracks vertical space without drawing.
 *
 * @param doc   - A jsPDF instance (needed for font metrics / text measurement)
 * @param node  - The TipTap node to measure
 * @param width - The available width for text wrapping
 * @param scale - Same scale factor as {@link renderTiptapContent}
 * @returns The total height the node would consume
 */
export function measureNodeHeight(
  doc: jsPDF,
  node: Record<string, unknown>,
  width: number,
  scale: number = 1,
): number {
  cfg = createConfig(scale);
  const n = node as unknown as TipTapNode;
  return measureNodeHeightInternal(doc, n, width, 0);
}

function measureNodeHeightInternal(
  doc: jsPDF,
  node: TipTapNode,
  width: number,
  depth: number,
): number {
  switch (node.type) {
    case 'heading':
      return measureHeading(doc, node, width);

    case 'paragraph':
      return measureParagraph(doc, node, width);

    case 'bulletList':
    case 'orderedList':
      return measureList(doc, node, width, depth);

    case 'taskList':
      return measureList(doc, node, width, depth);

    case 'codeBlock':
      return measureCodeBlock(doc, node, width);

    case 'blockquote':
      return measureBlockquote(doc, node, width, depth);

    case 'horizontalRule':
      return 16 + cfg.paragraphSpacing; // 8 above + 8 below + spacing

    default:
      if (node.content) {
        let total = 0;
        for (const child of node.content) {
          total += measureNodeHeightInternal(doc, child, width, depth);
        }
        return total;
      }
      return 0;
  }
}

function measureInlineContentHeight(
  doc: jsPDF,
  nodes: TipTapNode[],
  width: number,
  fontSize: number,
  lineHeightFactor: number = LINE_HEIGHT_PARAGRAPH,
): number {
  const lineHeight = fontSize * lineHeightFactor;

  // Approximate: concatenate all text, measure wrapped line count
  const fullText = nodes.map(extractPlainText).join('');
  if (!fullText) return lineHeight;

  doc.setFontSize(fontSize);
  const lines = doc.splitTextToSize(fullText, width) as string[];

  return lines.length * lineHeight;
}

function measureHeading(doc: jsPDF, node: TipTapNode, width: number): number {
  const level = (node.attrs?.level as number) ?? 1;
  const fontSize = cfg.headingSizes[level] ?? cfg.headingSizes[1];
  const lhFactor = LINE_HEIGHT_HEADINGS[level] ?? LINE_HEIGHT_PARAGRAPH;

  doc.setFont('GeistSans', 'bold');
  doc.setFontSize(fontSize);

  const inlines = collectInlineNodes(node.content);
  const contentHeight =
    inlines.length > 0
      ? measureInlineContentHeight(doc, inlines, width, fontSize, lhFactor)
      : fontSize * lhFactor;

  // Restore
  doc.setFont('GeistSans', 'normal');
  doc.setFontSize(cfg.paragraphSize);

  return (cfg.headingSpacingAbove[level] ?? 0) + contentHeight + (cfg.headingSpacingBelow[level] ?? 0);
}

function measureParagraph(doc: jsPDF, node: TipTapNode, width: number): number {
  doc.setFont('GeistSans', 'normal');
  doc.setFontSize(cfg.paragraphSize);

  const inlines = collectInlineNodes(node.content);
  const contentHeight =
    inlines.length > 0
      ? measureInlineContentHeight(doc, inlines, width, cfg.paragraphSize)
      : cfg.paragraphSize * LINE_HEIGHT_PARAGRAPH;

  return contentHeight + cfg.paragraphSpacing;
}

function measureList(
  doc: jsPDF,
  node: TipTapNode,
  width: number,
  depth: number,
): number {
  if (!node.content) return 0;

  let total = 0;
  const contentWidth = width - (depth + 1) * cfg.listIndent;

  for (const item of node.content) {
    if (!item.content) {
      total += cfg.paragraphSize * LINE_HEIGHT_PARAGRAPH + cfg.paragraphSpacing;
      continue;
    }

    for (const child of item.content) {
      if (child.type === 'bulletList' || child.type === 'orderedList' || child.type === 'taskList') {
        total += measureList(doc, child, width, depth + 1);
      } else if (child.type === 'paragraph') {
        doc.setFont('GeistSans', 'normal');
        doc.setFontSize(cfg.paragraphSize);
        const inlines = collectInlineNodes(child.content);
        const h =
          inlines.length > 0
            ? measureInlineContentHeight(doc, inlines, contentWidth, cfg.paragraphSize)
            : cfg.paragraphSize * LINE_HEIGHT_PARAGRAPH;
        total += h + cfg.paragraphSpacing;
      } else {
        total += measureNodeHeightInternal(doc, child, contentWidth, depth + 1);
      }
    }
  }

  return total;
}

function measureCodeBlock(doc: jsPDF, node: TipTapNode, width: number): number {
  doc.setFont('GeistMono', 'normal');
  doc.setFontSize(cfg.codeSize);

  const text = extractPlainText(node);
  const innerWidth = width - cfg.codePadX * 2;
  const lineHeight = cfg.codeSize * LINE_HEIGHT_CODE;
  const lines = text
    ? (doc.splitTextToSize(text, innerWidth) as string[])
    : [''];

  const bgHeight = lines.length * lineHeight + cfg.codePadY * 2;

  // Restore
  doc.setFont('GeistSans', 'normal');
  doc.setFontSize(cfg.paragraphSize);

  return bgHeight + cfg.paragraphSpacing;
}

function measureBlockquote(
  doc: jsPDF,
  node: TipTapNode,
  width: number,
  depth: number,
): number {
  const contentWidth = width - 16;
  let total = 0;

  if (node.content) {
    for (const child of node.content) {
      total += measureNodeHeightInternal(doc, child, contentWidth, depth);
    }
  }

  return total;
}
