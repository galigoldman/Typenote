import '@testing-library/jest-dom/vitest';

// Polyfill APIs missing in jsdom that Radix UI requires
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

window.HTMLElement.prototype.hasPointerCapture = () => false;
window.HTMLElement.prototype.setPointerCapture = () => {};
window.HTMLElement.prototype.releasePointerCapture = () => {};

if (!window.HTMLElement.prototype.getAnimations) {
  window.HTMLElement.prototype.getAnimations = () => [];
}
