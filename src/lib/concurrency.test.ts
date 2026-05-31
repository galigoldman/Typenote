import { describe, it, expect } from 'vitest';
import { runWithConcurrency } from './concurrency';

describe('runWithConcurrency', () => {
  it('runs every item and returns results in input order', async () => {
    const items = [1, 2, 3, 4, 5];
    const results = await runWithConcurrency(
      items,
      async (n) => {
        // Stagger completion so out-of-order resolution would be observable.
        await new Promise((r) => setTimeout(r, (5 - n) * 2));
        return n * 10;
      },
      { concurrency: 3 },
    );
    expect(results).toEqual([10, 20, 30, 40, 50]);
  });

  it('never exceeds the configured concurrency', async () => {
    let active = 0;
    let maxActive = 0;
    const items = Array.from({ length: 12 }, (_, i) => i);

    await runWithConcurrency(
      items,
      async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((r) => setTimeout(r, 3));
        active -= 1;
      },
      { concurrency: 4 },
    );

    expect(maxActive).toBeLessThanOrEqual(4);
    expect(maxActive).toBeGreaterThan(1); // proves it actually parallelised
  });

  it('stops pulling new items once shouldCancel returns true', async () => {
    let cancel = false;
    const started: number[] = [];
    const items = Array.from({ length: 20 }, (_, i) => i);

    const results = await runWithConcurrency(
      items,
      async (n) => {
        started.push(n);
        // Cancel as soon as the second item begins.
        if (n === 1) cancel = true;
        await new Promise((r) => setTimeout(r, 1));
        return n;
      },
      { concurrency: 2, shouldCancel: () => cancel },
    );

    // With concurrency 2, only the first two items get pulled before both
    // workers observe the cancel flag and bail.
    expect(started).toEqual([0, 1]);
    expect(results[0]).toBe(0);
    expect(results[1]).toBe(1);
    expect(results[2]).toBeUndefined();
  });

  it('does not start anything when cancelled up front', async () => {
    const started: number[] = [];
    const results = await runWithConcurrency(
      [1, 2, 3],
      async (n) => {
        started.push(n);
        return n;
      },
      { concurrency: 2, shouldCancel: () => true },
    );
    expect(started).toEqual([]);
    expect(results).toEqual([undefined, undefined, undefined]);
  });

  it('handles an empty input list', async () => {
    const results = await runWithConcurrency([], async () => 1, {
      concurrency: 3,
    });
    expect(results).toEqual([]);
  });

  it('isolates per-item errors handled inside the worker', async () => {
    const items = [1, 2, 3, 4];
    const outcomes = await runWithConcurrency(
      items,
      async (n) => {
        try {
          if (n % 2 === 0) throw new Error(`boom ${n}`);
          return `ok ${n}`;
        } catch (err) {
          return `failed ${(err as Error).message}`;
        }
      },
      { concurrency: 2 },
    );
    expect(outcomes).toEqual([
      'ok 1',
      'failed boom 2',
      'ok 3',
      'failed boom 4',
    ]);
  });
});
