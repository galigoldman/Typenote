import { describe, it, expect } from 'vitest';
import { isAtLeastVersion } from './version';

describe('isAtLeastVersion', () => {
  it('is true when the versions are equal', () => {
    expect(isAtLeastVersion('0.2.0', '0.2.0')).toBe(true);
  });

  it('is true for a higher patch / minor / major', () => {
    expect(isAtLeastVersion('0.2.1', '0.2.0')).toBe(true);
    expect(isAtLeastVersion('0.3.0', '0.2.0')).toBe(true);
    expect(isAtLeastVersion('1.0.0', '0.2.0')).toBe(true);
  });

  it('is false for a lower patch / minor', () => {
    expect(isAtLeastVersion('0.2.0', '0.2.1')).toBe(false);
    expect(isAtLeastVersion('0.1.9', '0.2.0')).toBe(false);
  });

  it('treats missing trailing segments as zero', () => {
    expect(isAtLeastVersion('0.2', '0.2.0')).toBe(true);
    expect(isAtLeastVersion('0.2.0', '0.2')).toBe(true);
    expect(isAtLeastVersion('1', '0.2.0')).toBe(true);
  });

  it('does not compare segments lexically (10 > 9)', () => {
    expect(isAtLeastVersion('0.10.0', '0.9.0')).toBe(true);
  });
});
