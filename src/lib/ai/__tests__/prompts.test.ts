import { describe, expect, it } from 'vitest';

import { buildLatexPrompt, buildSystemPrompt } from '../prompts';

describe('buildSystemPrompt', () => {
  it('returns generic prompt with no context', () => {
    const prompt = buildSystemPrompt({ hasDocumentContent: false });
    expect(prompt).toContain('You are a course tutor.');
    expect(prompt).not.toContain('tutor for **');
    expect(prompt).not.toContain("STUDENT'S DOCUMENT");
  });

  it('includes course name when provided', () => {
    const prompt = buildSystemPrompt({
      courseName: 'Linear Algebra',
      hasDocumentContent: false,
    });
    expect(prompt).toContain('tutor for **Linear Algebra**');
  });

  it('includes document awareness section when hasDocumentContent is true', () => {
    const prompt = buildSystemPrompt({
      courseName: 'Calculus I',
      hasDocumentContent: true,
    });
    expect(prompt).toContain("STUDENT'S DOCUMENT");
    expect(prompt).toContain('is my solution correct');
  });

  it('omits document section when hasDocumentContent is false', () => {
    const prompt = buildSystemPrompt({
      courseName: 'Calculus I',
      hasDocumentContent: false,
    });
    expect(prompt).not.toContain("STUDENT'S DOCUMENT");
  });

  it('always includes core guidelines', () => {
    const prompt = buildSystemPrompt({ hasDocumentContent: false });
    expect(prompt).toContain('never fabricate citations');
    expect(prompt).toContain('match the language of the question');
    expect(prompt).toContain('Use LaTeX for math');
    expect(prompt).toContain('[Sources]');
    expect(prompt).toContain('primary source');
    expect(prompt).toContain('smart AI');
  });

  it('cites materials with name-colon format', () => {
    const prompt = buildSystemPrompt({ hasDocumentContent: false });
    expect(prompt).toContain(
      '- Material Name: brief description of what was referenced',
    );
  });
});

describe('buildLatexPrompt', () => {
  it('returns base prompt when no courseName', () => {
    const prompt = buildLatexPrompt();
    expect(prompt).toContain('LaTeX conversion assistant');
    expect(prompt).not.toContain('student is in the course');
  });

  it('returns base prompt when courseName is empty string', () => {
    const prompt = buildLatexPrompt('');
    expect(prompt).not.toContain('student is in the course');
  });

  it('appends course context when courseName provided', () => {
    const prompt = buildLatexPrompt('Linear Algebra');
    expect(prompt).toContain('LaTeX conversion assistant');
    expect(prompt).toContain('student is in the course: Linear Algebra');
    expect(prompt).toContain('notation conventions');
  });
});

describe('buildSystemPrompt — homework mode', () => {
  it('omits homework section when not in homework mode', () => {
    const p = buildSystemPrompt({
      courseName: 'CS101',
      hasDocumentContent: false,
    });
    expect(p).not.toMatch(/HOMEWORK SESSION/);
  });

  it('includes exercise name and pinned materials when in homework mode', () => {
    const p = buildSystemPrompt({
      courseName: 'CS101',
      hasDocumentContent: true,
      isHomeworkMode: true,
      exerciseName: 'Problem Set 1',
      pinnedMaterialNames: ['Lecture 1', 'Notes'],
    });
    expect(p).toMatch(/HOMEWORK SESSION/);
    expect(p).toMatch(/Problem Set 1/);
    expect(p).toMatch(/Lecture 1/);
    expect(p).toMatch(/Notes/);
    // prioritize, don't restrict
    expect(p).toMatch(/not restricted|freely use/i);
    // tutoring stance
    expect(p).toMatch(/hint|guide|rather than/i);
  });

  it('handles homework mode with no pinned materials', () => {
    const p = buildSystemPrompt({
      hasDocumentContent: false,
      isHomeworkMode: true,
      exerciseName: 'PS2',
      pinnedMaterialNames: [],
    });
    expect(p).toMatch(/PS2/);
    expect(p).not.toMatch(/marked as most relevant/);
  });
});
