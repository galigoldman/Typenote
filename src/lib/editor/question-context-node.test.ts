import { describe, it, expect } from 'vitest';
import { QuestionContextNode } from './question-context-node';

describe('QuestionContextNode', () => {
  it('defines a node with name "questionContext"', () => {
    expect(QuestionContextNode.name).toBe('questionContext');
  });

  it('is an atom node (non-editable content)', () => {
    expect(QuestionContextNode.config.atom).toBe(true);
  });

  it('belongs to the block group', () => {
    expect(QuestionContextNode.config.group).toBe('block');
  });
});
