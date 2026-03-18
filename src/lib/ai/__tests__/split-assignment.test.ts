import { describe, it, expect } from 'vitest';
import { parseAiSplitResponse, snapBoundariesToElements } from '../split-assignment';

describe('parseAiSplitResponse', () => {
  it('parses valid AI JSON response into QuestionBoundary array', () => {
    const aiResponse = JSON.stringify({
      questions: [
        { label: '1', position: 0, boundary_start: 0, boundary_end: 30, parent_label: null, preamble_start: null, preamble_end: null, low_confidence: false },
        { label: '2', position: 1, boundary_start: 30, boundary_end: 60, parent_label: null, preamble_start: null, preamble_end: null, low_confidence: false },
      ],
    });
    const result = parseAiSplitResponse(aiResponse);
    expect(result).toHaveLength(2);
    expect(result[0].label).toBe('1');
    expect(result[0].boundaryStart).toBe(0);
    expect(result[1].label).toBe('2');
  });

  it('handles subquestions with parent references', () => {
    const aiResponse = JSON.stringify({
      questions: [
        { label: '1', position: 0, boundary_start: 0, boundary_end: 20, parent_label: null },
        { label: '1a', position: 1, boundary_start: 20, boundary_end: 40, parent_label: '1' },
        { label: '1b', position: 2, boundary_start: 40, boundary_end: 60, parent_label: '1' },
      ],
    });
    const result = parseAiSplitResponse(aiResponse);
    expect(result).toHaveLength(3);
    expect(result[1].parentLabel).toBe('1');
  });

  it('returns single question when AI response is unparseable', () => {
    const result = parseAiSplitResponse('invalid json garbage');
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe('1');
    expect(result[0].boundaryStart).toBe(0);
  });
});

describe('snapBoundariesToElements', () => {
  it('snaps boundary positions to nearest closing tag boundary', () => {
    const html = '<p>Question 1</p><p>Question 2</p>';
    const boundaries = [
      { label: '1', position: 0, boundaryStart: 0, boundaryEnd: 15 },
    ];
    const snapped = snapBoundariesToElements(boundaries, html);
    expect(snapped[0].boundaryEnd).toBe(17); // snaps to after </p>
  });

  it('preserves boundaries already on element boundaries', () => {
    const html = '<p>Q1</p><p>Q2</p>';
    const boundaries = [
      { label: '1', position: 0, boundaryStart: 0, boundaryEnd: 9 },
    ];
    const snapped = snapBoundariesToElements(boundaries, html);
    expect(snapped[0].boundaryEnd).toBe(9);
  });
});
