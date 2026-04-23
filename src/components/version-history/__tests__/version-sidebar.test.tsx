import { describe, it, expect } from 'vitest';
import { formatRelativeTime } from '../version-sidebar';

describe('formatRelativeTime', () => {
  const now = new Date('2026-04-13T12:00:00Z');

  it('returns "Just now" for < 1 minute ago', () => {
    const date = new Date('2026-04-13T11:59:30Z');
    expect(formatRelativeTime(date.toISOString(), now)).toBe('Just now');
  });

  it('returns "1 min ago" for 1 minute ago', () => {
    const date = new Date('2026-04-13T11:59:00Z');
    expect(formatRelativeTime(date.toISOString(), now)).toBe('1 min ago');
  });

  it('returns "30 min ago" for 30 minutes ago', () => {
    const date = new Date('2026-04-13T11:30:00Z');
    expect(formatRelativeTime(date.toISOString(), now)).toBe('30 min ago');
  });

  it('returns "1 hour ago" for 1 hour ago', () => {
    const date = new Date('2026-04-13T11:00:00Z');
    expect(formatRelativeTime(date.toISOString(), now)).toBe('1 hour ago');
  });

  it('returns "3 hours ago" for 3 hours ago', () => {
    const date = new Date('2026-04-13T09:00:00Z');
    expect(formatRelativeTime(date.toISOString(), now)).toBe('3 hours ago');
  });

  it('returns "Yesterday" for 1 day ago', () => {
    const date = new Date('2026-04-12T12:00:00Z');
    expect(formatRelativeTime(date.toISOString(), now)).toBe('Yesterday');
  });

  it('returns "3 days ago" for 3 days ago', () => {
    const date = new Date('2026-04-10T12:00:00Z');
    expect(formatRelativeTime(date.toISOString(), now)).toBe('3 days ago');
  });

  it('returns formatted date for > 7 days ago', () => {
    const date = new Date('2026-04-01T12:00:00Z');
    const result = formatRelativeTime(date.toISOString(), now);
    expect(result).toMatch(/Apr 1/);
  });
});
