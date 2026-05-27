import { describe, it, expect, vi, afterEach } from 'vitest';
import { copyText } from './clipboard';

// jsdom doesn't implement document.execCommand, so define it ourselves to
// exercise (and assert) the legacy fallback path.
function stubExecCommand(result: boolean) {
  const fn = vi.fn().mockReturnValue(result);
  Object.defineProperty(document, 'execCommand', {
    value: fn,
    configurable: true,
    writable: true,
  });
  return fn;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  // @ts-expect-error - remove the stubbed method between tests
  delete document.execCommand;
});

describe('copyText', () => {
  it('uses the async Clipboard API when available (secure context)', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const ok = await copyText('https://host/share/abc');
    expect(ok).toBe(true);
    expect(writeText).toHaveBeenCalledWith('https://host/share/abc');
  });

  it('falls back to execCommand when the Clipboard API is unavailable (insecure HTTP)', async () => {
    vi.stubGlobal('navigator', {}); // no .clipboard, e.g. plain http:// on an IP
    const exec = stubExecCommand(true);
    const ok = await copyText('https://host/share/xyz');
    expect(ok).toBe(true);
    expect(exec).toHaveBeenCalledWith('copy');
  });

  it('falls back to execCommand when writeText rejects (e.g. permission denied)', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const exec = stubExecCommand(true);
    const ok = await copyText('https://host/share/abc');
    expect(ok).toBe(true);
    expect(exec).toHaveBeenCalledWith('copy');
  });

  it('returns false when both methods fail', async () => {
    vi.stubGlobal('navigator', {});
    stubExecCommand(false);
    const ok = await copyText('whatever');
    expect(ok).toBe(false);
  });

  it('copies the full text, not a truncated value', async () => {
    const long = 'https://151.145.83.151:3002/share/' + 'a'.repeat(64);
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    await copyText(long);
    expect(writeText).toHaveBeenCalledWith(long);
    expect((writeText.mock.calls[0][0] as string).length).toBe(long.length);
  });
});
