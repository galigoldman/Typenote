import { describe, it, expect } from 'vitest';
import manifest from '@/app/manifest';

describe('PWA manifest', () => {
  const m = manifest();

  it('returns correct app name and description', () => {
    expect(m.name).toBe('Typenote');
    expect(m.short_name).toBe('Typenote');
    expect(m.description).toBe('Smart notes for STEM students');
  });

  it('sets standalone display mode', () => {
    expect(m.display).toBe('standalone');
  });

  it('sets start_url to dashboard', () => {
    expect(m.start_url).toBe('/dashboard');
  });

  it('includes required icon sizes', () => {
    const sizes = m.icons?.map((icon) => icon.sizes);
    expect(sizes).toContain('192x192');
    expect(sizes).toContain('512x512');
  });

  it('includes a maskable icon', () => {
    const maskable = m.icons?.find((icon) => icon.purpose === 'maskable');
    expect(maskable).toBeDefined();
    expect(maskable?.sizes).toBe('512x512');
  });

  it('defines theme and background colors', () => {
    expect(m.theme_color).toBeDefined();
    expect(m.background_color).toBeDefined();
  });
});
