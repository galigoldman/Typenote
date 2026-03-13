import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { CanvasPage, Stroke, TextBox } from '@/types/canvas';

// Mock the renderer dependencies before importing the module under test
vi.mock('../background-renderer', () => ({
  renderBackground: vi.fn(),
}));

vi.mock('../stroke-renderer', () => ({
  renderStroke: vi.fn(),
}));

vi.mock('../tiptap-to-pdf', () => ({
  renderTiptapContent: vi.fn(),
}));

import { renderBackground } from '../background-renderer';
import { renderStroke } from '../stroke-renderer';
import { renderTiptapContent } from '../tiptap-to-pdf';
import { renderCanvasPage } from '../canvas-page-renderer';

const mockRenderBackground = vi.mocked(renderBackground);
const mockRenderStroke = vi.mocked(renderStroke);
const mockRenderTiptapContent = vi.mocked(renderTiptapContent);

/** Creates a mock jsPDF document with the methods used by renderCanvasPage */
function makeMockDoc() {
  return {
    addPage: vi.fn(),
    saveGraphicsState: vi.fn(),
    restoreGraphicsState: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
  };
}

/** Helper to build a Stroke with sensible defaults */
function makeStroke(overrides: Partial<Stroke> = {}): Stroke {
  return {
    id: 'stroke-1',
    points: [
      [10, 20, 0.5],
      [30, 40, 0.6],
      [50, 60, 0.7],
    ],
    color: '#000000',
    width: 4,
    opacity: 1,
    bbox: { minX: 10, minY: 20, maxX: 50, maxY: 60 },
    createdAt: Date.now(),
    ...overrides,
  };
}

/** Helper to build a TextBox with sensible defaults */
function makeTextBox(overrides: Partial<TextBox> = {}): TextBox {
  return {
    id: 'text-1',
    x: 100,
    y: 200,
    width: 300,
    height: 100,
    content: {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] },
      ],
    },
    ...overrides,
  };
}

/** Helper to build a CanvasPage with sensible defaults */
function makePage(overrides: Partial<CanvasPage> = {}): CanvasPage {
  return {
    id: 'page-1',
    order: 0,
    strokes: [],
    textBoxes: [],
    flowContent: null,
    ...overrides,
  };
}

describe('renderCanvasPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should add a new page with correct dimensions when not first page', () => {
    const doc = makeMockDoc();
    const page = makePage();

    renderCanvasPage(doc as never, page, 'blank', false);

    expect(doc.addPage).toHaveBeenCalledOnce();
    expect(doc.addPage).toHaveBeenCalledWith([794, 1123]);
  });

  it('should not add page when isFirstPage is true', () => {
    const doc = makeMockDoc();
    const page = makePage();

    renderCanvasPage(doc as never, page, 'blank', true);

    expect(doc.addPage).not.toHaveBeenCalled();
  });

  it('should render background with page-specific type', () => {
    const doc = makeMockDoc();
    const page = makePage({ pageType: 'grid' });

    renderCanvasPage(doc as never, page, 'blank', true);

    expect(mockRenderBackground).toHaveBeenCalledOnce();
    expect(mockRenderBackground).toHaveBeenCalledWith(doc, 'grid', 794, 1123);
  });

  it('should fall back to document canvas_type for background', () => {
    const doc = makeMockDoc();
    const page = makePage(); // no pageType set

    renderCanvasPage(doc as never, page, 'lined', true);

    expect(mockRenderBackground).toHaveBeenCalledOnce();
    expect(mockRenderBackground).toHaveBeenCalledWith(doc, 'lined', 794, 1123);
  });

  it('should render all strokes', () => {
    const doc = makeMockDoc();
    const strokes = [
      makeStroke({ id: 's1', createdAt: 1 }),
      makeStroke({ id: 's2', createdAt: 2 }),
      makeStroke({ id: 's3', createdAt: 3 }),
    ];
    const page = makePage({ strokes });

    renderCanvasPage(doc as never, page, 'blank', true);

    expect(mockRenderStroke).toHaveBeenCalledTimes(3);
    expect(mockRenderStroke).toHaveBeenCalledWith(doc, strokes[0]);
    expect(mockRenderStroke).toHaveBeenCalledWith(doc, strokes[1]);
    expect(mockRenderStroke).toHaveBeenCalledWith(doc, strokes[2]);
  });

  it('should isolate each stroke with save/restore graphics state', () => {
    const doc = makeMockDoc();
    const strokes = [
      makeStroke({ id: 's1', createdAt: 1 }),
      makeStroke({ id: 's2', createdAt: 2 }),
    ];
    const page = makePage({ strokes });

    renderCanvasPage(doc as never, page, 'blank', true);

    // Each stroke gets its own save/restore pair (no shared clip region)
    expect(doc.saveGraphicsState).toHaveBeenCalledTimes(2);
    expect(doc.restoreGraphicsState).toHaveBeenCalledTimes(2);
    expect(doc.rect).not.toHaveBeenCalled();
    expect(doc.clip).not.toHaveBeenCalled();

    // Verify order: save → stroke → restore for each stroke
    const save1 = doc.saveGraphicsState.mock.invocationCallOrder[0];
    const stroke1 = mockRenderStroke.mock.invocationCallOrder[0];
    const restore1 = doc.restoreGraphicsState.mock.invocationCallOrder[0];
    const save2 = doc.saveGraphicsState.mock.invocationCallOrder[1];
    const stroke2 = mockRenderStroke.mock.invocationCallOrder[1];
    const restore2 = doc.restoreGraphicsState.mock.invocationCallOrder[1];

    expect(save1).toBeLessThan(stroke1);
    expect(stroke1).toBeLessThan(restore1);
    expect(restore1).toBeLessThan(save2);
    expect(save2).toBeLessThan(stroke2);
    expect(stroke2).toBeLessThan(restore2);
  });

  it('should not call save/restore when there are no strokes', () => {
    const doc = makeMockDoc();
    const page = makePage({ strokes: [] });

    renderCanvasPage(doc as never, page, 'blank', true);

    // No strokes means no save/restore calls
    expect(doc.saveGraphicsState).not.toHaveBeenCalled();
    expect(doc.restoreGraphicsState).not.toHaveBeenCalled();
    expect(doc.rect).not.toHaveBeenCalled();
    expect(doc.clip).not.toHaveBeenCalled();
  });

  it('should render text boxes with content', () => {
    const doc = makeMockDoc();
    const textBoxes = [
      makeTextBox({ id: 'tb1', x: 50, y: 100, width: 200 }),
      makeTextBox({ id: 'tb2', x: 300, y: 400, width: 150 }),
    ];
    const page = makePage({ textBoxes });

    renderCanvasPage(doc as never, page, 'blank', true);

    expect(mockRenderTiptapContent).toHaveBeenCalledTimes(2);
    expect(mockRenderTiptapContent).toHaveBeenCalledWith(
      doc,
      textBoxes[0].content,
      50,
      100,
      200,
    );
    expect(mockRenderTiptapContent).toHaveBeenCalledWith(
      doc,
      textBoxes[1].content,
      300,
      400,
      150,
    );
  });

  it('should skip empty text boxes', () => {
    const doc = makeMockDoc();
    const textBoxes = [
      // Text box with no content array
      makeTextBox({
        id: 'tb-empty-null',
        content: { type: 'doc', content: [] },
      }),
      // Text box with valid content
      makeTextBox({ id: 'tb-valid', x: 10, y: 20, width: 100 }),
      // Text box whose content has an empty content array
      makeTextBox({
        id: 'tb-empty-array',
        content: { type: 'doc', content: [] },
      }),
    ];
    const page = makePage({ textBoxes });

    renderCanvasPage(doc as never, page, 'blank', true);

    // Only the one valid text box should have been rendered
    expect(mockRenderTiptapContent).toHaveBeenCalledTimes(1);
    expect(mockRenderTiptapContent).toHaveBeenCalledWith(
      doc,
      textBoxes[1].content,
      10,
      20,
      100,
    );
  });

  it('should use correct page dimensions (794x1123)', () => {
    const doc = makeMockDoc();
    const page = makePage();

    renderCanvasPage(doc as never, page, 'dotted', false);

    // Verify addPage uses the correct dimensions
    expect(doc.addPage).toHaveBeenCalledWith([794, 1123]);

    // Verify background renderer is called with correct dimensions
    expect(mockRenderBackground).toHaveBeenCalledWith(doc, 'dotted', 794, 1123);
  });
});
