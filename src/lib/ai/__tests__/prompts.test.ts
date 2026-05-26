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

describe('buildSystemPrompt context files', () => {
  it('adds an attached-files section when names are present', () => {
    const out = buildSystemPrompt({
      courseName: 'Algebra',
      hasDocumentContent: false,
      contextFileNames: ['HW3.pdf', 'Lecture 5'],
    });
    expect(out).toContain('ATTACHED CONTEXT FILES');
    expect(out).toContain('HW3.pdf');
    expect(out).toContain('Lecture 5');
  });

  it('omits the section when there are no attached files', () => {
    const out = buildSystemPrompt({
      courseName: 'Algebra',
      hasDocumentContent: false,
    });
    expect(out).not.toContain('ATTACHED CONTEXT FILES');
  });
});
