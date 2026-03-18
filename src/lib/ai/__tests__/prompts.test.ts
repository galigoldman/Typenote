import { describe, expect, it } from 'vitest';

import { buildQuestionSplitPrompt, buildSystemPrompt } from '../prompts';

describe('buildSystemPrompt', () => {
  it('returns generic prompt with no context', () => {
    const prompt = buildSystemPrompt({ hasDocumentContent: false });
    expect(prompt).toContain('You are a course tutor.');
    expect(prompt).not.toContain('tutor for **');
    expect(prompt).not.toContain('working on **Week');
    expect(prompt).not.toContain("STUDENT'S DOCUMENT");
  });

  it('includes course name when provided', () => {
    const prompt = buildSystemPrompt({
      courseName: 'Linear Algebra',
      hasDocumentContent: false,
    });
    expect(prompt).toContain('tutor for **Linear Algebra**');
    expect(prompt).not.toContain('working on **Week');
  });

  it('includes course name and week label when both provided', () => {
    const prompt = buildSystemPrompt({
      courseName: 'Linear Algebra',
      weekLabel: 'Week 5',
      hasDocumentContent: false,
    });
    expect(prompt).toContain('tutor for **Linear Algebra**');
    expect(prompt).toContain('working on **Week 5**');
  });

  it('includes document awareness section when hasDocumentContent is true', () => {
    const prompt = buildSystemPrompt({
      courseName: 'Calculus I',
      weekLabel: 'Week 3',
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

  it('handles week label without course name', () => {
    const prompt = buildSystemPrompt({
      weekLabel: 'Week 7',
      hasDocumentContent: false,
    });
    expect(prompt).toContain('You are a course tutor.');
    expect(prompt).toContain('working on **Week 7**');
  });

  it('always includes core guidelines', () => {
    const prompt = buildSystemPrompt({ hasDocumentContent: false });
    expect(prompt).toContain('Never fabricate citations');
    expect(prompt).toContain('match the language of the question');
    expect(prompt).toContain('Use LaTeX for math');
    expect(prompt).toContain('[Sources]');
    expect(prompt).toContain('primary source');
    expect(prompt).toContain('smart AI');
  });
});

describe('buildQuestionSplitPrompt', () => {
  it('produces a prompt that instructs the AI to return JSON boundaries', () => {
    const prompt = buildQuestionSplitPrompt('<p>1. Solve x+2=5</p><p>2. Find the derivative</p>');
    expect(prompt).toContain('boundary_start');
    expect(prompt).toContain('boundary_end');
    expect(prompt).toContain('JSON');
  });
});
