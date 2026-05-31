/**
 * Runs an async `worker` over `items` with a bounded number of concurrent
 * in-flight calls, optionally stopping early when `shouldCancel` returns true.
 *
 * Why this exists: Moodle file downloads used to run strictly one-at-a-time,
 * which (combined with the old per-file popup) made a full-course sync crawl.
 * Running a few at a time is dramatically faster, but we still need to stop
 * promptly when the user cancels — a naive `Promise.all(items.map(...))` would
 * fire every request at once and ignore cancellation. This is the smallest
 * primitive that gives us both: a fixed-size worker pool that re-checks
 * `shouldCancel` before pulling each new item.
 *
 * Results are returned in the SAME order as `items`. Items that were never
 * started (because the run was cancelled first) are left `undefined`.
 *
 * Errors are NOT caught here — the caller's `worker` is expected to handle its
 * own failures so one bad item doesn't reject the whole pool.
 */
export interface RunWithConcurrencyOptions {
  /** Maximum number of workers running at once (clamped to >= 1). */
  concurrency: number;
  /** Polled before each item is pulled; return true to stop starting new work. */
  shouldCancel?: () => boolean;
}

export async function runWithConcurrency<T, R>(
  items: readonly T[],
  worker: (item: T, index: number) => Promise<R>,
  { concurrency, shouldCancel }: RunWithConcurrencyOptions,
): Promise<Array<R | undefined>> {
  const results: Array<R | undefined> = new Array(items.length);
  // Shared cursor: JS is single-threaded, so the read-then-increment between
  // awaits is atomic — no two workers ever grab the same index.
  let cursor = 0;
  const poolSize = Math.max(1, Math.min(concurrency, items.length || 1));

  async function runWorker(): Promise<void> {
    while (true) {
      if (shouldCancel?.()) return;
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: poolSize }, () => runWorker()));
  return results;
}
