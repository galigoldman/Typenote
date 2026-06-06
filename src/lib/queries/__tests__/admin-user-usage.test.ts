import { describe, it, expect } from 'vitest';
import {
  groupByMonth,
  groupByDay,
  toQueryLog,
  groupByDocument,
} from '@/lib/queries/admin-user-usage';

const ev = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 'e1',
  query_type: 'chat',
  model: 'flash',
  input_tokens: 1_000_000,
  output_tokens: 0,
  course_id: null,
  document_id: null,
  created_at: '2099-01-05T10:00:00.000Z',
  ...over,
});

describe('groupByMonth', () => {
  it('sums queries/tokens/cost per month, newest first', () => {
    const rows = groupByMonth([
      ev(),
      ev({ created_at: '2099-02-01T00:00:00.000Z' }),
    ]);
    expect(rows[0].month).toBe('2099-02');
    expect(rows[1].month).toBe('2099-01');
    expect(rows[1].queryCount).toBe(1);
    expect(rows[1].estimatedCostUsd).toBeCloseTo(0.3, 4);
  });
});

describe('groupByDay', () => {
  it('buckets by UTC day', () => {
    const rows = groupByDay([
      ev({ created_at: '2099-01-05T10:00:00.000Z' }),
      ev({ created_at: '2099-01-05T23:00:00.000Z' }),
      ev({ created_at: '2099-01-06T01:00:00.000Z' }),
    ]);
    expect(rows.find((r) => r.day === '2099-01-05')!.queryCount).toBe(2);
    expect(rows.find((r) => r.day === '2099-01-06')!.queryCount).toBe(1);
  });
});

describe('toQueryLog', () => {
  it('maps rows to per-query entries with cost, newest first', () => {
    const log = toQueryLog([
      ev({ id: 'a', created_at: '2099-01-05T10:00:00.000Z' }),
      ev({ id: 'b', created_at: '2099-01-06T10:00:00.000Z' }),
    ]);
    expect(log[0].id).toBe('b');
    expect(log[0].estimatedCostUsd).toBeCloseTo(0.3, 4);
  });
});

describe('groupByDocument', () => {
  it('groups by document_id with a null bucket', () => {
    const rows = groupByDocument(
      [
        ev({ document_id: 'd1' }),
        ev({ document_id: 'd1' }),
        ev({ document_id: null }),
      ],
      { d1: 'Lecture 1' },
    );
    const d1 = rows.find((r) => r.documentId === 'd1')!;
    expect(d1.title).toBe('Lecture 1');
    expect(d1.queryCount).toBe(2);
    expect(rows.find((r) => r.documentId === null)!.title).toBe('No document');
  });
});
