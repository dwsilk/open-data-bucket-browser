import { describe, expect, it } from 'vitest';
import { baseName, formatBytes } from './format';

describe('formatBytes', () => {
  it.each([
    [0, '0 B'],
    [999, '999 B'],
    [1_000, '1.00 KB'],
    [38_100_000, '38.1 MB'],
    [123_456_789_012, '123 GB'],
  ])('formats %d as %s', (bytes, expected) => {
    expect(formatBytes(bytes)).toBe(expected);
  });

  it('gives nothing for a value that is not a size', () => {
    expect(formatBytes(Number.NaN)).toBe('');
  });
});

describe('baseName', () => {
  it('keeps the slash of a folder', () => {
    expect(baseName('a/b/c.txt')).toBe('c.txt');
    expect(baseName('a/b/')).toBe('b/');
  });
});
