import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock the tiptap-to-pdf module before importing the module under test
// ---------------------------------------------------------------------------
vi.mock('../tiptap-to-pdf', () => ({
  measureNodeHeight: vi.fn(),
  renderTiptapContent: vi.fn(),
  PX_TO_PT: 72 / 96,
}));

import { measureNodeHeight, renderTiptapContent } from '../tiptap-to-pdf';
import { renderTextDocument } from '../text-document-renderer';

const mockMeasureNodeHeight = vi.mocked(measureNodeHeight);
const mockRenderTiptapContent = vi.mocked(renderTiptapContent);

// ---------------------------------------------------------------------------
// Constants (mirrored from the renderer for assertions)
// ---------------------------------------------------------------------------
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 72;
const USABLE_WIDTH = PAGE_WIDTH - 2 * MARGIN; // ~451.28
const USABLE_HEIGHT = PAGE_HEIGHT - 2 * MARGIN; // ~697.89
const ORPHAN_THRESHOLD = 0.15;

/** Creates a minimal mock jsPDF with the methods used by renderTextDocument */
function makeMockDoc() {
  return {
    addPage: vi.fn(),
  };
}

/** Builds a TipTap document with the given top-level nodes */
function makeTiptapDoc(nodes: Record<string, unknown>[]) {
  return {
    type: 'doc',
    content: nodes,
  };
}

describe('renderTextDocument', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: each node fits comfortably on a page
    mockMeasureNodeHeight.mockReturnValue(20);
    // Default: renderTiptapContent advances cursor by the measured height
    mockRenderTiptapContent.mockImplementation((_doc, _content, _x, y, _w) => {
      // The mock returns y + height of the single-node doc.
      // In practice the renderer passes a single-node wrapper, so we return
      // y + whatever measureNodeHeight last returned.
      return y + 20;
    });
  });

  // -------------------------------------------------------------------------
  // Test 1: A4 page dimensions
  // -------------------------------------------------------------------------
  it('should create A4 pages (595x842 pts)', () => {
    const doc = makeMockDoc();
    // Two nodes that together exceed one page to force addPage
    mockMeasureNodeHeight.mockReturnValue(400);
    mockRenderTiptapContent.mockImplementation((_d, _c, _x, y) => y + 400);

    const content = makeTiptapDoc([
      { type: 'paragraph', content: [{ type: 'text', text: 'A' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'B' }] },
    ]);

    renderTextDocument(doc as never, content);

    // When a page break occurs the renderer should call addPage with 'a4'
    expect(doc.addPage).toHaveBeenCalledWith('a4');
  });

  // -------------------------------------------------------------------------
  // Test 2: 72pt margins
  // -------------------------------------------------------------------------
  it('should use 72pt margins', () => {
    const doc = makeMockDoc();
    const content = makeTiptapDoc([
      { type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] },
    ]);

    renderTextDocument(doc as never, content);

    // renderTiptapContent should be called with x = MARGIN, y = MARGIN
    expect(mockRenderTiptapContent).toHaveBeenCalledOnce();
    const call = mockRenderTiptapContent.mock.calls[0];
    expect(call[2]).toBe(MARGIN); // x
    expect(call[3]).toBe(MARGIN); // y (cursor starts at MARGIN)
    expect(call[4]).toBe(USABLE_WIDTH); // width
  });

  // -------------------------------------------------------------------------
  // Test 3: Page break on overflow
  // -------------------------------------------------------------------------
  it('should add new page when content overflows', () => {
    const doc = makeMockDoc();

    // First node takes up almost all usable height
    const firstHeight = USABLE_HEIGHT - 10;
    // Second node won't fit on the remaining 10 pts
    const secondHeight = 50;

    let callIndex = 0;
    mockMeasureNodeHeight.mockImplementation(() => {
      callIndex++;
      return callIndex === 1 ? firstHeight : secondHeight;
    });

    let renderCall = 0;
    mockRenderTiptapContent.mockImplementation((_d, _c, _x, y) => {
      renderCall++;
      return y + (renderCall === 1 ? firstHeight : secondHeight);
    });

    const content = makeTiptapDoc([
      { type: 'paragraph', content: [{ type: 'text', text: 'First' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Second' }] },
    ]);

    renderTextDocument(doc as never, content);

    expect(doc.addPage).toHaveBeenCalledOnce();
    expect(doc.addPage).toHaveBeenCalledWith('a4');

    // Second node should be rendered at MARGIN (top of new page)
    const secondRenderCall = mockRenderTiptapContent.mock.calls[1];
    expect(secondRenderCall[3]).toBe(MARGIN);
  });

  // -------------------------------------------------------------------------
  // Test 4: Orphan heading prevention
  // -------------------------------------------------------------------------
  it('should prevent orphan headings', () => {
    const doc = makeMockDoc();

    // First node fills the page up to the bottom 15% zone
    // The orphan zone starts at: MARGIN + USABLE_HEIGHT * (1 - ORPHAN_THRESHOLD)
    const orphanZoneStart = USABLE_HEIGHT * (1 - ORPHAN_THRESHOLD);
    // Place cursor just inside the orphan zone
    const firstHeight = orphanZoneStart + 1;
    const headingHeight = 30;

    let callIndex = 0;
    mockMeasureNodeHeight.mockImplementation(() => {
      callIndex++;
      return callIndex === 1 ? firstHeight : headingHeight;
    });

    let renderCall = 0;
    mockRenderTiptapContent.mockImplementation((_d, _c, _x, y) => {
      renderCall++;
      return y + (renderCall === 1 ? firstHeight : headingHeight);
    });

    const content = makeTiptapDoc([
      { type: 'paragraph', content: [{ type: 'text', text: 'Long text' }] },
      {
        type: 'heading',
        attrs: { level: 1 },
        content: [{ type: 'text', text: 'Title' }],
      },
    ]);

    renderTextDocument(doc as never, content);

    // Heading should be pushed to a new page
    expect(doc.addPage).toHaveBeenCalledOnce();

    // The heading should render at MARGIN (top of new page)
    const headingRenderCall = mockRenderTiptapContent.mock.calls[1];
    expect(headingRenderCall[3]).toBe(MARGIN);
  });

  // -------------------------------------------------------------------------
  // Test 5: Empty content
  // -------------------------------------------------------------------------
  it('should handle empty content gracefully', () => {
    const doc = makeMockDoc();

    // Empty doc (no content array)
    renderTextDocument(doc as never, { type: 'doc' });
    expect(doc.addPage).not.toHaveBeenCalled();
    expect(mockRenderTiptapContent).not.toHaveBeenCalled();

    vi.clearAllMocks();

    // Doc with empty content array
    renderTextDocument(doc as never, { type: 'doc', content: [] });
    expect(doc.addPage).not.toHaveBeenCalled();
    expect(mockRenderTiptapContent).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Test 6: All node types rendered
  // -------------------------------------------------------------------------
  it('should render all node types', () => {
    const doc = makeMockDoc();

    const nodes = [
      {
        type: 'heading',
        attrs: { level: 1 },
        content: [{ type: 'text', text: 'Title' }],
      },
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'Body text' }],
      },
      {
        type: 'bulletList',
        content: [
          {
            type: 'listItem',
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: 'Item' }],
              },
            ],
          },
        ],
      },
      {
        type: 'codeBlock',
        content: [{ type: 'text', text: 'const x = 1;' }],
      },
      { type: 'horizontalRule' },
      {
        type: 'blockquote',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Quote' }],
          },
        ],
      },
    ];

    const content = makeTiptapDoc(nodes);

    renderTextDocument(doc as never, content);

    // renderTiptapContent should be called once per node
    expect(mockRenderTiptapContent).toHaveBeenCalledTimes(nodes.length);

    // Each call should receive a single-node wrapper doc
    for (let i = 0; i < nodes.length; i++) {
      const call = mockRenderTiptapContent.mock.calls[i];
      const wrappedDoc = call[1] as Record<string, unknown>;
      expect(wrappedDoc).toEqual({
        type: 'doc',
        content: [nodes[i]],
      });
    }
  });
});
