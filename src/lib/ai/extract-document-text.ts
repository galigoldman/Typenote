// ---------------------------------------------------------------------------
// TipTap document text extraction for AI context
//
// Extracts plain text from TipTap JSON content so that AI models can read
// document content without needing to understand the rich-text structure.
// Math expressions are preserved in $...$ notation for AI readability.
//
// This module mirrors the recursive traversal pattern from
// src/lib/pdf/tiptap-to-pdf.ts (extractPlainText) but extends it to:
//   1. Wrap mathExpression nodes' LaTeX in $...$ delimiters
//   2. Handle both canvas documents (pages[].flowContent) and text documents
// ---------------------------------------------------------------------------

import type { CanvasPage } from '@/types/canvas';

/**
 * Minimal TipTap node shape — only the fields needed for text extraction.
 *
 * We define our own interface rather than importing the one from tiptap-to-pdf
 * because that file couples its types to jsPDF rendering concerns. Keeping a
 * separate (compatible) definition avoids pulling in PDF dependencies.
 */
interface TipTapNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TipTapNode[];
  text?: string;
}

// ---------------------------------------------------------------------------
// Core recursive extraction
// ---------------------------------------------------------------------------

/**
 * Recursively extracts plain text from a single TipTap node.
 *
 * - Text nodes yield their `text` value directly.
 * - Math expression nodes yield their LaTeX wrapped in `$...$` so the AI
 *   model can recognise them as math.
 * - Block-level nodes (paragraph, heading, listItem, etc.) join their
 *   children with empty string (inline concatenation) — the caller is
 *   responsible for joining blocks with newlines.
 */
export function extractNodeText(node: TipTapNode): string {
  // Leaf: plain text
  if (node.type === 'text' && node.text != null) {
    return node.text;
  }

  // Leaf: math expression — wrap LaTeX in dollar signs
  if (node.type === 'mathExpression') {
    const latex = (node.attrs?.latex as string) ?? '';
    return latex ? `$${latex}$` : '';
  }

  // No children — nothing to extract
  if (!node.content || node.content.length === 0) {
    return '';
  }

  // Block-level nodes that should be separated by newlines when they appear
  // as direct children of a container (doc, blockquote, listItem, etc.)
  const blockTypes = new Set([
    'paragraph',
    'heading',
    'codeBlock',
    'blockquote',
    'bulletList',
    'orderedList',
    'taskList',
    'horizontalRule',
  ]);

  // If this node is a container whose children are block-level, join with
  // newlines. Otherwise join inline (e.g. marks, listItem wrapping a
  // paragraph).
  const hasBlockChildren = node.content.some((child) =>
    blockTypes.has(child.type),
  );

  const separator = hasBlockChildren ? '\n' : '';

  return node.content.map((child) => extractNodeText(child)).join(separator);
}

// ---------------------------------------------------------------------------
// Document-level extraction
// ---------------------------------------------------------------------------

/**
 * Extracts readable plain text from a full Typenote document.
 *
 * Handles two document shapes transparently:
 *
 * 1. **Text documents** — have a `content` field containing a TipTap JSON
 *    document (`{ type: 'doc', content: [...] }`).
 * 2. **Canvas documents** — have a `pages` array where each page may carry
 *    `flowContent` (a TipTap JSON document for the text layer of that page).
 *
 * When both fields are present, text content is extracted first, followed by
 * canvas page content, separated by newlines.
 *
 * @returns A trimmed plain-text string. Returns empty string for empty or
 *          null/undefined documents.
 */
export function extractDocumentText(document: {
  content?: Record<string, unknown> | null;
  pages?: unknown;
}): string {
  if (!document) return '';

  const parts: string[] = [];

  // --- Text document content ---
  if (document.content) {
    const text = extractTipTapDoc(document.content);
    if (text) parts.push(text);
  }

  // --- Canvas pages (flowContent per page) ---
  if (document.pages && Array.isArray(document.pages)) {
    for (const page of document.pages as CanvasPage[]) {
      if (page.flowContent) {
        const text = extractTipTapDoc(
          page.flowContent as Record<string, unknown>,
        );
        if (text) parts.push(text);
      }
    }
  }

  return parts.join('\n').trim();
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Extracts text from a TipTap document root node (the `{ type: 'doc', content: [...] }` shape).
 */
function extractTipTapDoc(doc: Record<string, unknown>): string {
  const typedDoc = doc as unknown as TipTapNode;

  if (!typedDoc.content || !Array.isArray(typedDoc.content)) {
    return '';
  }

  return typedDoc.content
    .map((node) => extractNodeText(node as TipTapNode))
    .filter(Boolean)
    .join('\n');
}
