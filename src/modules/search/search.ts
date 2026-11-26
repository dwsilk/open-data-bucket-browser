/**
 * Client-side search over the dataset summaries.
 *
 * About 1,150 datasets and 1 MB of text: a precomputed lowercase haystack per
 * field and a linear scan answer every keystroke in well under a frame, so a
 * search library or a prebuilt inverted index would be a dependency with
 * nothing to do.
 *
 * Every query word must match somewhere (AND). Where it matches sets the rank:
 * a hit in the name outweighs a tag, which outweighs the description.
 */
import type { DatasetSummary } from '../registry/types';

export interface SearchOptions {
  query: string;
  tag: string | null;
  org: string | null;
}

interface Prepared {
  dataset: DatasetSummary;
  name: string;
  tags: string;
  owner: string;
  buckets: string;
  summary: string;
}

const WEIGHTS = { name: 10, tags: 6, buckets: 5, owner: 4, summary: 1 } as const;
const WORD_START_BONUS = 1.5;
/** Added when the whole query appears in the name, so "sentinel 2" puts Sentinel-2 first. */
const PHRASE_IN_NAME = 20;
const NAME_IS_PHRASE = 40;

export function words(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[\s,]+/)
    .filter(w => w !== '');
}

function fieldScore(haystack: string, word: string, weight: number): number {
  const at = haystack.indexOf(word);
  if (at < 0) return 0;
  const wordStart = at === 0 || !/[a-z0-9]/.test(haystack.charAt(at - 1));
  return wordStart ? weight * WORD_START_BONUS : weight;
}

export class DatasetSearch {
  private readonly prepared: Prepared[];

  constructor(datasets: readonly DatasetSummary[]) {
    this.prepared = datasets.map(dataset => ({
      dataset,
      name: dataset.name.toLowerCase(),
      tags: dataset.tags.join(' | ').toLowerCase(),
      owner: dataset.managedBy.toLowerCase(),
      buckets: dataset.buckets
        .map(b => `${b.bucket}/${b.prefix}`)
        .join(' ')
        .toLowerCase(),
      summary: dataset.summary.toLowerCase(),
    }));
  }

  /** Matching datasets, best first; alphabetical when there is no query. */
  search({ query, tag, org }: SearchOptions): DatasetSummary[] {
    const terms = words(query);
    const phrase = terms.join(' ');
    const scored: { dataset: DatasetSummary; score: number }[] = [];

    for (const p of this.prepared) {
      if (tag != null && !p.dataset.tags.includes(tag)) continue;
      if (org != null && p.dataset.managedBy !== org) continue;
      let total = 0;
      let missed = false;
      for (const word of terms) {
        const score =
          fieldScore(p.name, word, WEIGHTS.name) +
          fieldScore(p.tags, word, WEIGHTS.tags) +
          fieldScore(p.buckets, word, WEIGHTS.buckets) +
          fieldScore(p.owner, word, WEIGHTS.owner) +
          fieldScore(p.summary, word, WEIGHTS.summary);
        if (score === 0) {
          missed = true;
          break;
        }
        total += score;
      }
      if (missed) continue;
      if (phrase !== '') {
        const name = p.name.replace(/[^a-z0-9]+/g, ' ').trim();
        if (name === phrase) total += NAME_IS_PHRASE;
        else if (` ${name} `.includes(` ${phrase} `)) total += PHRASE_IN_NAME;
      }
      scored.push({ dataset: p.dataset, score: total });
    }

    return scored
      .sort((a, b) => b.score - a.score || a.dataset.name.localeCompare(b.dataset.name))
      .map(s => s.dataset);
  }

  /** Tag counts over all datasets, most used first. */
  tagCounts(): [tag: string, count: number][] {
    return countSorted(this.prepared.flatMap(p => p.dataset.tags));
  }

  /** Dataset counts per organisation, largest first. */
  organisationCounts(): [organisation: string, count: number][] {
    return countSorted(this.prepared.map(p => p.dataset.managedBy).filter(o => o !== ''));
  }
}

function countSorted(values: string[]): [value: string, count: number][] {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}
