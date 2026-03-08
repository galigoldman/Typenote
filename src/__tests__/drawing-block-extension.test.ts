import { describe, it, expect } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { createDrawingBlockExtension } from '@/lib/editor/drawing-block-extension';

// ---------------------------------------------------------------------------
// We pass a dummy component since the Node extension factory requires one,
// but we never actually render a React NodeView in these unit tests.
// ---------------------------------------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const DummyView = (() => null) as any;

/**
 * Helper: create a headless Tiptap editor with the drawing block extension.
 * Tiptap's core `Editor` works without a DOM when `element` is not provided
 * (it renders to a detached document fragment internally).
 */
function createTestEditor(content?: Record<string, unknown>) {
  return new Editor({
    extensions: [StarterKit, createDrawingBlockExtension(DummyView)],
    content: content ?? {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'hello' }] },
      ],
    },
  });
}

// ---------------------------------------------------------------------------
// Extension configuration
// ---------------------------------------------------------------------------

describe('drawingBlock extension configuration', () => {
  it('creates a node with the correct name', () => {
    const editor = createTestEditor();
    const nodeType = editor.schema.nodes.drawingBlock;

    expect(nodeType).toBeDefined();
    expect(nodeType.name).toBe('drawingBlock');

    editor.destroy();
  });

  it('has the expected default attributes', () => {
    const editor = createTestEditor();
    const nodeType = editor.schema.nodes.drawingBlock;
    const defaults = nodeType.defaultAttrs;

    expect(defaults).toMatchObject({
      id: null,
      width: 800,
      height: 400,
      background: 'transparent',
      strokes: [],
    });

    editor.destroy();
  });

  it('belongs to the block group and is an atom', () => {
    const editor = createTestEditor();
    const nodeType = editor.schema.nodes.drawingBlock;

    expect(nodeType.isBlock).toBe(true);
    expect(nodeType.isAtom).toBe(true);

    editor.destroy();
  });
});

// ---------------------------------------------------------------------------
// insertDrawingBlock command
// ---------------------------------------------------------------------------

describe('insertDrawingBlock command', () => {
  it('inserts a drawing block with a generated UUID id', () => {
    const editor = createTestEditor();

    editor.commands.insertDrawingBlock({});

    const json = editor.getJSON();
    const drawingNode = json.content?.find((n) => n.type === 'drawingBlock');

    expect(drawingNode).toBeDefined();
    expect(drawingNode!.attrs).toBeDefined();
    // UUID v4 pattern: 8-4-4-4-12 hex characters
    expect(drawingNode!.attrs!.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );

    editor.destroy();
  });

  it('accepts optional width/height overrides', () => {
    const editor = createTestEditor();

    editor.commands.insertDrawingBlock({ width: 600, height: 300 });

    const json = editor.getJSON();
    const drawingNode = json.content?.find((n) => n.type === 'drawingBlock');

    expect(drawingNode!.attrs!.width).toBe(600);
    expect(drawingNode!.attrs!.height).toBe(300);

    editor.destroy();
  });
});

// ---------------------------------------------------------------------------
// JSON round-trip
// ---------------------------------------------------------------------------

describe('JSON round-trip', () => {
  it('preserves strokes through getJSON / setContent', () => {
    const editor = createTestEditor();

    // Insert a drawing block
    editor.commands.insertDrawingBlock({});

    // Get the JSON, modify strokes on the drawing block, and set it back
    const json = editor.getJSON();
    const drawingNode = json.content?.find((n) => n.type === 'drawingBlock');
    expect(drawingNode).toBeDefined();

    // Simulate adding strokes to the attrs
    const testStrokes = [
      {
        id: 's1',
        points: [
          [10, 10, 0.5],
          [20, 20, 0.5],
        ],
        color: '#000000',
        width: 2,
        tool: 'pen',
      },
    ];
    drawingNode!.attrs = { ...drawingNode!.attrs, strokes: testStrokes };

    // Set the modified JSON back into the editor
    editor.commands.setContent(json);

    // Re-extract and verify strokes survive the round-trip
    const roundTripped = editor.getJSON();
    const roundTrippedNode = roundTripped.content?.find(
      (n) => n.type === 'drawingBlock',
    );

    expect(roundTrippedNode).toBeDefined();
    expect(roundTrippedNode!.attrs!.strokes).toEqual(testStrokes);

    editor.destroy();
  });
});
