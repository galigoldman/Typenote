import { describe, it, expect } from 'vitest';
import {
  extractPluginfileUrl,
  pickPluginfileUrl,
  isNonContentPluginfile,
  fileExtensionOf,
  extensionMatches,
} from './url-resolve';

describe('extractPluginfileUrl', () => {
  it('extracts a pluginfile URL from an <object> embed', () => {
    const html = `<object data="https://moodle.runi.ac.il/pluginfile.php/12345/mod_resource/content/3/lecture%201.pdf?forcedownload=1" type="application/pdf"></object>`;
    expect(extractPluginfileUrl(html)).toBe(
      'https://moodle.runi.ac.il/pluginfile.php/12345/mod_resource/content/3/lecture%201.pdf?forcedownload=1',
    );
  });

  it('decodes &amp; in the matched URL', () => {
    const html = `<a href="https://m.x.ac.il/pluginfile.php/1/mod_resource/content/0/a.pdf?time=1&amp;forcedownload=1">x</a>`;
    expect(extractPluginfileUrl(html)).toBe(
      'https://m.x.ac.il/pluginfile.php/1/mod_resource/content/0/a.pdf?time=1&forcedownload=1',
    );
  });

  it('returns null when there is no pluginfile link', () => {
    const html = `<div>no file, just a <a href="https://host/course/view.php?id=1">course</a></div>`;
    expect(extractPluginfileUrl(html)).toBeNull();
  });

  it('does not match relative pluginfile paths (requires scheme)', () => {
    const html = `<a href="/pluginfile.php/1/mod_resource/content/0/a.pdf">x</a>`;
    expect(extractPluginfileUrl(html)).toBeNull();
  });
});

describe('pickPluginfileUrl', () => {
  it('skips a leading avatar pluginfile and returns the real resource', () => {
    // Avatar appears in the header BEFORE the resource — the bug we are guarding.
    const html = `
      <img src="https://m.ac.il/pluginfile.php/55/user/icon/boost/f1?rev=2">
      <object data="https://m.ac.il/pluginfile.php/999/mod_resource/content/1/slides.pptx"></object>
    `;
    expect(pickPluginfileUrl(html)).toBe(
      'https://m.ac.il/pluginfile.php/999/mod_resource/content/1/slides.pptx',
    );
  });

  it('skips a theme-logo pluginfile and returns the real resource', () => {
    const html = `
      <img src="https://m.ac.il/pluginfile.php/1/theme/boost/logo/1/logo.png">
      <a href="https://m.ac.il/pluginfile.php/42/mod_resource/content/0/notes.pdf">notes</a>
    `;
    expect(pickPluginfileUrl(html)).toBe(
      'https://m.ac.il/pluginfile.php/42/mod_resource/content/0/notes.pdf',
    );
  });

  it('prefers a forcedownload=1 link even if a non-content one comes first', () => {
    const html = `
      <img src="https://m.ac.il/pluginfile.php/55/user/icon/boost/f1">
      <a href="https://m.ac.il/pluginfile.php/7/mod_resource/content/0/preview.pdf">preview</a>
      <a href="https://m.ac.il/pluginfile.php/7/mod_resource/content/0/real.pdf?forcedownload=1">download</a>
    `;
    expect(pickPluginfileUrl(html)).toBe(
      'https://m.ac.il/pluginfile.php/7/mod_resource/content/0/real.pdf?forcedownload=1',
    );
  });

  it('falls back to the first match when every link is non-content', () => {
    const html = `<img src="https://m.ac.il/pluginfile.php/55/user/icon/boost/f1.png">`;
    expect(pickPluginfileUrl(html)).toBe(
      'https://m.ac.il/pluginfile.php/55/user/icon/boost/f1.png',
    );
  });

  it('returns null when there is no pluginfile link', () => {
    expect(pickPluginfileUrl('<p>nothing here</p>')).toBeNull();
  });

  it('decodes &amp; on the chosen URL', () => {
    const html = `<a href="https://m.ac.il/pluginfile.php/7/mod_resource/content/0/x.pdf?a=1&amp;forcedownload=1">d</a>`;
    expect(pickPluginfileUrl(html)).toBe(
      'https://m.ac.il/pluginfile.php/7/mod_resource/content/0/x.pdf?a=1&forcedownload=1',
    );
  });
});

describe('isNonContentPluginfile', () => {
  it.each([
    ['https://m/pluginfile.php/55/user/icon/boost/f1', true],
    ['https://m/pluginfile.php/1/theme/boost/logo/1/logo.png', true],
    ['https://m/pluginfile.php/3/course/overviewfiles/0/cover.jpg', true],
    ['https://m/pluginfile.php/9/mod_resource/content/0/real.pdf', false],
  ])('%s -> %s', (url, expected) => {
    expect(isNonContentPluginfile(url)).toBe(expected);
  });
});

describe('fileExtensionOf', () => {
  it('reads extension from a URL with a query string', () => {
    expect(
      fileExtensionOf(
        'https://m/pluginfile.php/1/x/y/lecture.pdf?forcedownload=1',
      ),
    ).toBe('pdf');
  });

  it('percent-decodes the segment before reading the extension', () => {
    expect(fileExtensionOf('https://m/x/lecture%20one.PPTX')).toBe('pptx');
  });

  it('reads extension from a bare filename', () => {
    expect(fileExtensionOf('notes.docx')).toBe('docx');
  });

  it('returns null for unknown/undeterminable extensions', () => {
    expect(fileExtensionOf('https://m/x/file.xyz')).toBeNull();
    expect(fileExtensionOf('https://m/x/noextension')).toBeNull();
    expect(fileExtensionOf('')).toBeNull();
  });
});

describe('extensionMatches', () => {
  it('accepts when resolved extension equals expected', () => {
    expect(
      extensionMatches('https://m/pluginfile.php/1/x/real.pdf', 'real.pdf'),
    ).toBe(true);
  });

  it('rejects an avatar PNG resolved for an expected PDF', () => {
    expect(
      extensionMatches(
        'https://m/pluginfile.php/55/user/icon/boost/f1.png',
        'lecture.pdf',
      ),
    ).toBe(false);
  });

  it('accepts (does not block) when either extension is unknown', () => {
    // Resolved is a redirect=1 view URL with no file extension -> unknown -> allow.
    expect(
      extensionMatches(
        'https://m/mod/resource/view.php?id=5&redirect=1',
        'lecture.pdf',
      ),
    ).toBe(true);
    // Expected name has no extension -> unknown -> allow.
    expect(
      extensionMatches('https://m/pluginfile.php/1/x/real.pdf', 'lecture'),
    ).toBe(true);
  });
});
