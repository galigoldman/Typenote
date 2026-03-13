import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock all dependencies before importing the module under test
// ---------------------------------------------------------------------------

const mockAddPage = vi.fn();
const mockSave = vi.fn();
const mockJsPdfInstance = {
  addPage: mockAddPage,
  save: mockSave,
};

vi.mock('jspdf', () => ({
  jsPDF: vi.fn(function () {
    return mockJsPdfInstance;
  }),
}));

vi.mock('../font-loader', () => ({
  loadFonts: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../canvas-page-renderer', () => ({
  renderCanvasPage: vi.fn(),
}));

vi.mock('../text-document-renderer', () => ({
  renderTextDocument: vi.fn(),
}));

vi.mock('../utils', () => ({
  sanitizeFilename: vi.fn((title: string) => title || 'Untitled'),
}));

import { jsPDF } from 'jspdf';
import { loadFonts } from '../font-loader';
import { renderCanvasPage } from '../canvas-page-renderer';
import { renderTextDocument } from '../text-document-renderer';
import { sanitizeFilename } from '../utils';
import { exportDocumentAsPdf, type ExportableDocument } from '../export-pdf';

const mockJsPDF = vi.mocked(jsPDF);
const mockLoadFonts = vi.mocked(loadFonts);
const mockRenderCanvasPage = vi.mocked(renderCanvasPage);
const mockRenderTextDocument = vi.mocked(renderTextDocument);
const mockSanitizeFilename = vi.mocked(sanitizeFilename);

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeCanvasPages(count: number) {
  return {
    pages: Array.from({ length: count }, (_, i) => ({
      id: `page-${i}`,
      order: i,
      strokes: [],
      textBoxes: [],
      flowContent: null,
    })),
  };
}

function makeTextContent() {
  return {
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'Hello world' }] },
    ],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('exportDocumentAsPdf', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Test 1: Mixed documents — canvas pages rendered before text
  // -------------------------------------------------------------------------
  it('should render canvas pages first for mixed documents', async () => {
    const callOrder: string[] = [];
    mockRenderCanvasPage.mockImplementation(() => {
      callOrder.push('canvas');
    });
    mockRenderTextDocument.mockImplementation(() => {
      callOrder.push('text');
    });

    const document: ExportableDocument = {
      title: 'Mixed Doc',
      content: makeTextContent(),
      pages: makeCanvasPages(2),
      canvas_type: 'blank',
    };

    await exportDocumentAsPdf(document);

    // Canvas renderer should be called before text renderer
    expect(callOrder).toEqual(['canvas', 'canvas', 'text']);
    expect(mockRenderCanvasPage).toHaveBeenCalledTimes(2);
    expect(mockRenderTextDocument).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // Test 2: Mixed documents — addPage('a4') called between canvas and text
  // -------------------------------------------------------------------------
  it('should append text pages after canvas pages', async () => {
    const callOrder: string[] = [];
    mockRenderCanvasPage.mockImplementation(() => {
      callOrder.push('renderCanvas');
    });
    mockAddPage.mockImplementation((format) => {
      callOrder.push(
        `addPage:${typeof format === 'string' ? format : 'custom'}`,
      );
    });
    mockRenderTextDocument.mockImplementation(() => {
      callOrder.push('renderText');
    });

    const document: ExportableDocument = {
      title: 'Mixed Doc',
      content: makeTextContent(),
      pages: makeCanvasPages(1),
      canvas_type: 'lined',
    };

    await exportDocumentAsPdf(document);

    // After canvas rendering, an A4 page should be added before text rendering
    expect(callOrder).toEqual(['renderCanvas', 'addPage:a4', 'renderText']);
  });

  // -------------------------------------------------------------------------
  // Test 3: Canvas-only documents
  // -------------------------------------------------------------------------
  it('should handle canvas-only documents', async () => {
    const document: ExportableDocument = {
      title: 'Canvas Only',
      content: {}, // empty content — no text
      pages: makeCanvasPages(3),
      canvas_type: 'grid',
    };

    await exportDocumentAsPdf(document);

    expect(mockRenderCanvasPage).toHaveBeenCalledTimes(3);
    expect(mockRenderTextDocument).not.toHaveBeenCalled();

    // No addPage('a4') should have been called for text transition
    const a4Calls = mockAddPage.mock.calls.filter((call) => call[0] === 'a4');
    expect(a4Calls).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // Test 4: Text-only documents
  // -------------------------------------------------------------------------
  it('should handle text-only documents', async () => {
    const document: ExportableDocument = {
      title: 'Text Only',
      content: makeTextContent(),
      pages: null,
      canvas_type: 'blank',
    };

    await exportDocumentAsPdf(document);

    expect(mockRenderTextDocument).toHaveBeenCalledTimes(1);
    expect(mockRenderTextDocument).toHaveBeenCalledWith(
      mockJsPdfInstance,
      document.content,
    );
    expect(mockRenderCanvasPage).not.toHaveBeenCalled();

    // No transition page should be added for text-only docs
    expect(mockAddPage).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Test 5: Empty documents
  // -------------------------------------------------------------------------
  it('should handle empty documents', async () => {
    const document: ExportableDocument = {
      title: 'Empty',
      content: {},
      pages: null,
      canvas_type: 'blank',
    };

    await exportDocumentAsPdf(document);

    // Neither renderer should be called
    expect(mockRenderCanvasPage).not.toHaveBeenCalled();
    expect(mockRenderTextDocument).not.toHaveBeenCalled();

    // Save should still be triggered (blank PDF)
    expect(mockSave).toHaveBeenCalledOnce();
  });

  // -------------------------------------------------------------------------
  // Additional: Verify jsPDF is created with correct format
  // -------------------------------------------------------------------------
  it('should create jsPDF with canvas format for documents with canvas pages', async () => {
    const document: ExportableDocument = {
      title: 'Canvas Doc',
      content: {},
      pages: makeCanvasPages(1),
      canvas_type: 'blank',
    };

    await exportDocumentAsPdf(document);

    expect(mockJsPDF).toHaveBeenCalledWith({
      orientation: 'portrait',
      unit: 'pt',
      format: [794, 1123],
    });
  });

  it('should create jsPDF with A4 format for text-only documents', async () => {
    const document: ExportableDocument = {
      title: 'Text Doc',
      content: makeTextContent(),
      pages: null,
      canvas_type: 'blank',
    };

    await exportDocumentAsPdf(document);

    expect(mockJsPDF).toHaveBeenCalledWith({
      orientation: 'portrait',
      unit: 'pt',
      format: 'a4',
    });
  });

  it('should load fonts before rendering', async () => {
    const callOrder: string[] = [];
    mockLoadFonts.mockImplementation(async () => {
      callOrder.push('loadFonts');
    });
    mockRenderTextDocument.mockImplementation(() => {
      callOrder.push('renderText');
    });

    const document: ExportableDocument = {
      title: 'Doc',
      content: makeTextContent(),
      pages: null,
      canvas_type: 'blank',
    };

    await exportDocumentAsPdf(document);

    expect(callOrder[0]).toBe('loadFonts');
    expect(callOrder[1]).toBe('renderText');
  });

  it('should save with sanitized filename', async () => {
    const document: ExportableDocument = {
      title: 'My Document',
      content: {},
      pages: null,
      canvas_type: 'blank',
    };

    await exportDocumentAsPdf(document);

    expect(mockSanitizeFilename).toHaveBeenCalledWith('My Document');
    expect(mockSave).toHaveBeenCalledOnce();
    expect(mockSave).toHaveBeenCalledWith('My Document.pdf');
  });

  it('should sort canvas pages by order before rendering', async () => {
    const renderOrders: number[] = [];
    mockRenderCanvasPage.mockImplementation((_doc, page) => {
      renderOrders.push((page as { order: number }).order);
    });

    // Pages intentionally out of order
    const document: ExportableDocument = {
      title: 'Unordered',
      content: {},
      pages: {
        pages: [
          { id: 'p3', order: 2, strokes: [], textBoxes: [], flowContent: null },
          { id: 'p1', order: 0, strokes: [], textBoxes: [], flowContent: null },
          { id: 'p2', order: 1, strokes: [], textBoxes: [], flowContent: null },
        ],
      },
      canvas_type: 'blank',
    };

    await exportDocumentAsPdf(document);

    expect(renderOrders).toEqual([0, 1, 2]);
  });
});
