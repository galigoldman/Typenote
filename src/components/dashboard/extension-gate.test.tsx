import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const originalMatchMedia = globalThis.window?.matchMedia;
const originalChrome = (globalThis as Record<string, unknown>).chrome;

function setSupported(supported: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query === '(pointer: fine)' ? supported : false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
    onchange: null,
  }));
  if (supported) {
    // Mimic a clean Chromium browser without the extension installed.
    (globalThis as Record<string, unknown>).chrome = {
      loadTimes: () => ({}),
      csi: () => ({}),
      app: {},
    };
  } else {
    delete (globalThis as Record<string, unknown>).chrome;
  }
}

afterEach(() => {
  if (originalMatchMedia) window.matchMedia = originalMatchMedia;
  if (originalChrome) {
    (globalThis as Record<string, unknown>).chrome = originalChrome;
  } else {
    delete (globalThis as Record<string, unknown>).chrome;
  }
});

const { ExtensionGate } = await import('./extension-gate');

describe('ExtensionGate', () => {
  it('renders children on a supported platform', () => {
    setSupported(true);
    render(
      <ExtensionGate>
        <p>moodle ui</p>
      </ExtensionGate>,
    );
    expect(screen.getByText('moodle ui')).toBeInTheDocument();
  });

  it('renders nothing on an unsupported platform', () => {
    setSupported(false);
    const { container } = render(
      <ExtensionGate>
        <p>moodle ui</p>
      </ExtensionGate>,
    );
    expect(container.firstChild).toBeNull();
  });
});
