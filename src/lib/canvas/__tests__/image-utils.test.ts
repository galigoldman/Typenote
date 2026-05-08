import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { processClipboardImage } from '../image-utils';

// processClipboardImage relies on browser Image, canvas, and URL APIs that
// jsdom doesn't fully implement. We test the logic via integration-style mocks.

// Mock canvas context
function createMockCtx(pixelData?: Uint8ClampedArray) {
  const defaultData = new Uint8ClampedArray(4).fill(255); // single opaque white pixel
  return {
    drawImage: vi.fn(),
    getImageData: vi.fn(() => ({ data: pixelData ?? defaultData })),
  } as unknown as CanvasRenderingContext2D;
}

// Mock canvas element
function createMockCanvas(ctx: CanvasRenderingContext2D) {
  return {
    width: 0,
    height: 0,
    getContext: vi.fn(() => ctx),
    toDataURL: vi.fn((mime: string) => `data:${mime};base64,AAAA`),
  };
}

describe('processClipboardImage', () => {
  let mockCtx: CanvasRenderingContext2D;
  let mockCanvas: ReturnType<typeof createMockCanvas>;
  const originalCreateElement = document.createElement.bind(document);

  function setup(opts?: { pixelData?: Uint8ClampedArray }) {
    mockCtx = createMockCtx(opts?.pixelData);
    mockCanvas = createMockCanvas(mockCtx);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'canvas') return mockCanvas as unknown as HTMLCanvasElement;
      return originalCreateElement(tag);
    });
  }

  function mockImage(width: number, height: number) {
    // Use stubGlobal so `new Image()` works as a constructor
    class MockImage {
      width = 0;
      height = 0;
      src = '';
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;

      constructor() {
        setTimeout(() => {
          this.width = width;
          this.height = height;
          this.onload?.();
        }, 0);
      }
    }
    vi.stubGlobal('Image', MockImage);
  }

  beforeEach(() => {
    setup();
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('returns correct aspect ratio for landscape image', async () => {
    mockImage(800, 600);
    const result = await processClipboardImage(
      new Blob([''], { type: 'image/jpeg' }),
    );
    expect(result.aspectRatio).toBeCloseTo(800 / 600);
    expect(result.width).toBe(800);
    expect(result.height).toBe(600);
  });

  it('returns correct aspect ratio for portrait image', async () => {
    mockImage(600, 800);
    const result = await processClipboardImage(
      new Blob([''], { type: 'image/jpeg' }),
    );
    expect(result.aspectRatio).toBeCloseTo(600 / 800);
  });

  it('resizes landscape image exceeding max dimension', async () => {
    mockImage(2400, 1200);
    const result = await processClipboardImage(
      new Blob([''], { type: 'image/jpeg' }),
    );
    expect(result.width).toBe(1200);
    expect(result.height).toBe(600);
    expect(result.aspectRatio).toBeCloseTo(2);
  });

  it('resizes portrait image exceeding max dimension', async () => {
    mockImage(900, 1800);
    const result = await processClipboardImage(
      new Blob([''], { type: 'image/jpeg' }),
    );
    expect(result.height).toBe(1200);
    expect(result.width).toBe(600);
    expect(result.aspectRatio).toBeCloseTo(0.5);
  });

  it('does not resize image within max dimension', async () => {
    mockImage(500, 400);
    const result = await processClipboardImage(
      new Blob([''], { type: 'image/jpeg' }),
    );
    expect(result.width).toBe(500);
    expect(result.height).toBe(400);
  });

  it('outputs JPEG for non-transparent images', async () => {
    mockImage(800, 600);
    const result = await processClipboardImage(
      new Blob([''], { type: 'image/jpeg' }),
    );
    expect(result.src).toContain('image/jpeg');
  });

  it('outputs PNG for PNG images with transparency', async () => {
    mockImage(100, 100);
    const transparentData = new Uint8ClampedArray(100 * 100 * 4).fill(255);
    transparentData[3] = 0; // first pixel fully transparent
    setup({ pixelData: transparentData });

    const result = await processClipboardImage(
      new Blob([''], { type: 'image/png' }),
    );
    expect(result.src).toContain('image/png');
  });

  it('outputs JPEG for PNG images without transparency', async () => {
    mockImage(100, 100);
    const result = await processClipboardImage(
      new Blob([''], { type: 'image/png' }),
    );
    expect(result.src).toContain('image/jpeg');
  });
});
