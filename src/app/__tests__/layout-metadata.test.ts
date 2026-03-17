import { describe, it, expect } from 'vitest';
import { metadata, viewport } from '../layout';

describe('Root layout PWA metadata', () => {
  it('sets applicationName to Typenote', () => {
    expect(metadata.applicationName).toBe('Typenote');
  });

  it('enables Apple Web App with standalone capability', () => {
    expect(metadata.appleWebApp).toEqual(
      expect.objectContaining({
        capable: true,
        title: 'Typenote',
      })
    );
  });

  it('includes apple-touch-icon in icons', () => {
    const icons = metadata.icons as { apple: string };
    expect(icons.apple).toBe('/icons/apple-touch-icon.png');
  });

  it('sets theme color in viewport', () => {
    expect(viewport?.themeColor).toBeDefined();
  });

  it('disables telephone format detection', () => {
    expect(metadata.formatDetection).toEqual(
      expect.objectContaining({ telephone: false })
    );
  });
});
