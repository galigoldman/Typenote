import { describe, it, expect } from 'vitest';
import { SUBJECTS, CANVAS_TYPES } from './subjects';

describe('SUBJECTS', () => {
  it('contains all expected subjects', () => {
    const values = SUBJECTS.map((s) => s.value);
    expect(values).toContain('calculus');
    expect(values).toContain('linear_algebra');
    expect(values).toContain('discrete_math');
    expect(values).toContain('logic');
    expect(values).toContain('data_structures');
    expect(values).toContain('algorithms');
    expect(values).toContain('physics');
    expect(values).toContain('other');
    expect(values).toHaveLength(8);
  });

  it('each subject has a label', () => {
    SUBJECTS.forEach((s) => {
      expect(s.label).toBeTruthy();
    });
  });
});

describe('CANVAS_TYPES', () => {
  it('contains blank, lined, and grid', () => {
    const values = CANVAS_TYPES.map((c) => c.value);
    expect(values).toEqual(['blank', 'lined', 'grid']);
  });
});
