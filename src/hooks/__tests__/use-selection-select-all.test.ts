import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSelection } from '../use-selection';
import type { Stroke, TextBox, ImageObject, BBox } from '@/types/canvas';

/**
 * Ctrl+A select-all. The canvas has no native select-all, so the selection
 * hook exposes selectAll(pageId), which must gather every object on the page —
 * strokes, text boxes, AND images — into the selection so a following Delete
 * clears the page. (Text boxes are notably excluded from tap/marquee selection,
 * so select-all is the one path that picks them up.)
 */

function stroke(id: string, bbox: BBox): Stroke {
  return {
    id,
    points: [
      [bbox.minX, bbox.minY, 0.5],
      [bbox.maxX, bbox.maxY, 0.5],
    ],
    bbox,
    color: '#000',
    width: 2,
    tool: 'pen',
    opacity: 1,
  } as Stroke;
}

function textBox(id: string, x: number, y: number): TextBox {
  return {
    id,
    x,
    y,
    width: 100,
    height: 40,
    content: null,
    fontScale: 1,
  } as TextBox;
}

function image(id: string, x: number, y: number): ImageObject {
  return {
    id,
    x,
    y,
    width: 80,
    height: 80,
    aspectRatio: 1,
    src: '',
    createdAt: 0,
  } as ImageObject;
}

function setup(opts: {
  strokes?: Stroke[];
  textBoxes?: TextBox[];
  images?: ImageObject[];
}) {
  return renderHook(() =>
    useSelection({
      activeTool: 'select',
      getPageStrokes: () => opts.strokes ?? [],
      getPageTextBoxes: () => opts.textBoxes ?? [],
      getPageImages: () => opts.images ?? [],
      onStrokesMove: () => {},
    }),
  );
}

describe('useSelection.selectAll', () => {
  it('selects every stroke, text box, and image on the page', () => {
    const { result } = setup({
      strokes: [stroke('s1', { minX: 0, minY: 0, maxX: 10, maxY: 10 })],
      textBoxes: [textBox('t1', 20, 20)],
      images: [image('i1', 200, 200)],
    });

    act(() => {
      result.current.selectAll('p1');
    });

    expect(result.current.selectedStrokeIds).toEqual(new Set(['s1']));
    expect(result.current.selectedTextBoxIds).toEqual(new Set(['t1']));
    expect(result.current.selectedImageIds).toEqual(new Set(['i1']));
    expect(result.current.selectionPageId).toBe('p1');
  });

  it('sets a selection bbox spanning the union of all objects', () => {
    const { result } = setup({
      strokes: [stroke('s1', { minX: 0, minY: 0, maxX: 10, maxY: 10 })],
      images: [image('i1', 200, 200)], // extends to 280,280
    });

    act(() => {
      result.current.selectAll('p1');
    });

    expect(result.current.selectionBBox).toEqual({
      minX: 0,
      minY: 0,
      maxX: 280,
      maxY: 280,
    });
  });

  it('does nothing on an empty page (no selection state)', () => {
    const { result } = setup({});

    act(() => {
      result.current.selectAll('p1');
    });

    expect(result.current.selectedStrokeIds.size).toBe(0);
    expect(result.current.selectedTextBoxIds.size).toBe(0);
    expect(result.current.selectedImageIds.size).toBe(0);
    expect(result.current.selectionPageId).toBeNull();
    expect(result.current.selectionBBox).toBeNull();
  });
});
