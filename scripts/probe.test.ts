import { describe, expect, it } from 'vitest';
import { classify, pool } from './probe';

const ORIGIN = 'https://example.org';

describe('classify', () => {
  it('needs both a listing and a matching CORS header to call a bucket browsable', () => {
    expect(classify(200, '*', ORIGIN)).toBe('browsable');
    expect(classify(200, ORIGIN, ORIGIN)).toBe('browsable');
    expect(classify(200, null, ORIGIN)).toBe('no-cors');
    expect(classify(200, 'https://other.org', ORIGIN)).toBe('no-cors');
  });

  it('separates refused, missing and failed buckets', () => {
    expect(classify(403, '*', ORIGIN)).toBe('denied');
    expect(classify(404, null, ORIGIN)).toBe('missing');
    expect(classify(500, null, ORIGIN)).toBe('unreachable');
  });
});

describe('pool', () => {
  it('keeps results in input order and never exceeds the limit', async () => {
    let running = 0;
    let peak = 0;
    const results = await pool([5, 1, 4, 2, 3], 2, async n => {
      running++;
      peak = Math.max(peak, running);
      await new Promise(done => setTimeout(done, n));
      running--;
      return n * 10;
    });
    expect(results).toEqual([50, 10, 40, 20, 30]);
    expect(peak).toBe(2);
  });
});
