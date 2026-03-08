import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const manifestPath = join(process.cwd(), 'public', 'manifest.json');

describe('PWA Manifest (manifest.json)', () => {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));

  it('has required field: name', () => {
    expect(manifest.name).toBeDefined();
    expect(typeof manifest.name).toBe('string');
    expect(manifest.name.length).toBeGreaterThan(0);
  });

  it('has required field: short_name', () => {
    expect(manifest.short_name).toBeDefined();
    expect(typeof manifest.short_name).toBe('string');
    expect(manifest.short_name.length).toBeGreaterThan(0);
  });

  it('has required field: start_url', () => {
    expect(manifest.start_url).toBeDefined();
    expect(typeof manifest.start_url).toBe('string');
  });

  it('has required field: display', () => {
    expect(manifest.display).toBeDefined();
  });

  it('has required field: icons', () => {
    expect(manifest.icons).toBeDefined();
    expect(Array.isArray(manifest.icons)).toBe(true);
    expect(manifest.icons.length).toBeGreaterThan(0);
  });

  it('has display set to "standalone"', () => {
    expect(manifest.display).toBe('standalone');
  });

  it('has an icon with 192x192 size', () => {
    const icon192 = manifest.icons.find(
      (icon: { sizes: string }) => icon.sizes === '192x192',
    );
    expect(icon192).toBeDefined();
    expect(icon192.type).toBe('image/png');
    expect(icon192.src).toBeDefined();
  });

  it('has an icon with 512x512 size', () => {
    const icon512 = manifest.icons.find(
      (icon: { sizes: string }) => icon.sizes === '512x512',
    );
    expect(icon512).toBeDefined();
    expect(icon512.type).toBe('image/png');
    expect(icon512.src).toBeDefined();
  });

  it('has a valid theme_color', () => {
    expect(manifest.theme_color).toBeDefined();
    expect(manifest.theme_color).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it('has a valid background_color', () => {
    expect(manifest.background_color).toBeDefined();
    expect(manifest.background_color).toMatch(/^#[0-9a-fA-F]{6}$/);
  });
});
