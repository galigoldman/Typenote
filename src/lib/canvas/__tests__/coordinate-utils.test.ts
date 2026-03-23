import { describe, expect, it } from 'vitest';

import type { Camera } from '../zoom-physics';
import {
  cameraToViewTransform,
  pageToScreen,
  screenToPage,
} from '../coordinate-utils';
import { focalPointOffset } from '../zoom-physics';

describe('screenToPage / pageToScreen roundtrip', () => {
  it('converts screen → page → screen at zoom 1.0', () => {
    const vt = { scale: 1.0, offsetX: 0, offsetY: 0 };
    const page = screenToPage(200, 300, vt);
    const screen = pageToScreen(page.x, page.y, vt);
    expect(screen.x).toBeCloseTo(200);
    expect(screen.y).toBeCloseTo(300);
  });

  it('converts screen → page → screen at zoom 2.0 with offset', () => {
    const vt = { scale: 2.0, offsetX: 50, offsetY: 100 };
    const page = screenToPage(250, 500, vt);
    expect(page.x).toBeCloseTo(100);
    expect(page.y).toBeCloseTo(200);
    const screen = pageToScreen(page.x, page.y, vt);
    expect(screen.x).toBeCloseTo(250);
    expect(screen.y).toBeCloseTo(500);
  });

  it('handles sub-1.0 scale (zoomed out)', () => {
    const vt = { scale: 0.5, offsetX: 100, offsetY: 50 };
    const page = screenToPage(150, 100, vt);
    expect(page.x).toBeCloseTo(100); // (150 - 100) / 0.5
    expect(page.y).toBeCloseTo(100); // (100 - 50) / 0.5
    const screen = pageToScreen(page.x, page.y, vt);
    expect(screen.x).toBeCloseTo(150);
    expect(screen.y).toBeCloseTo(100);
  });
});

describe('cameraToViewTransform', () => {
  it('computes scale as fitScale * zoom', () => {
    const camera: Camera = { x: 10, y: 20, zoom: 2.0, fitScale: 0.8 };
    const vt = cameraToViewTransform(camera);
    expect(vt.scale).toBeCloseTo(1.6);
    expect(vt.offsetX).toBe(10);
    expect(vt.offsetY).toBe(20);
  });

  it('handles sub-100% zoom', () => {
    const camera: Camera = { x: 50, y: 50, zoom: 0.5, fitScale: 1.2 };
    const vt = cameraToViewTransform(camera);
    expect(vt.scale).toBeCloseTo(0.6);
  });
});

describe('focal-point zoom accuracy', () => {
  it('content point stays at same screen position after zoom change', () => {
    const camera: Camera = { x: 0, y: 0, zoom: 1.0, fitScale: 1.0 };
    const screenPt = { x: 300, y: 400 };

    // Convert screen point to content space at current zoom
    const vt = cameraToViewTransform(camera);
    const contentPt = screenToPage(screenPt.x, screenPt.y, vt);

    // Zoom to 2.0 using focal-point formula
    const newZoom = 2.0;
    const newScale = camera.fitScale * newZoom;
    const newX = focalPointOffset(screenPt.x, contentPt.x, newScale);
    const newY = focalPointOffset(screenPt.y, contentPt.y, newScale);

    // Verify: the content point maps back to the same screen point
    const newVt = { scale: newScale, offsetX: newX, offsetY: newY };
    const backToScreen = pageToScreen(contentPt.x, contentPt.y, newVt);
    expect(backToScreen.x).toBeCloseTo(screenPt.x, 5);
    expect(backToScreen.y).toBeCloseTo(screenPt.y, 5);
  });

  it('works for zoom-out (2.0 → 0.5)', () => {
    const camera: Camera = { x: -200, y: -100, zoom: 2.0, fitScale: 1.0 };
    const screenPt = { x: 400, y: 300 };

    const vt = cameraToViewTransform(camera);
    const contentPt = screenToPage(screenPt.x, screenPt.y, vt);

    const newZoom = 0.5;
    const newScale = camera.fitScale * newZoom;
    const newX = focalPointOffset(screenPt.x, contentPt.x, newScale);
    const newY = focalPointOffset(screenPt.y, contentPt.y, newScale);

    const newVt = { scale: newScale, offsetX: newX, offsetY: newY };
    const backToScreen = pageToScreen(contentPt.x, contentPt.y, newVt);
    expect(backToScreen.x).toBeCloseTo(screenPt.x, 5);
    expect(backToScreen.y).toBeCloseTo(screenPt.y, 5);
  });
});
