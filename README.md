# Open Data Bucket Browser

A static web page to search the
[Registry of Open Data on AWS](https://registry.opendata.aws) and browse the
public S3 buckets of its datasets.

The page is read-only and anonymous. It has no sign-in, no upload, and no
server. The browser lists each bucket directly with unsigned S3 requests.

## Quick start

```sh
nvm use              # Node 26
npm ci
npm run index        # clone the registry and check every bucket (about 3 minutes)
npm run dev
```

The app does not start without an index. `npm run index` writes it to
`public/data/`. For a faster index that does not check bucket access, use
`npm run index -- --no-probe`. That index includes every dataset with a public
bucket, also the ones a web page cannot list, so use it for development only.

## How it works

1. **Build time.** `scripts/index-registry.ts` clones
   [awslabs/open-data-registry](https://github.com/awslabs/open-data-registry),
   reads each dataset's YAML, and keeps the datasets that have an anonymous S3
   bucket. Then it sends one listing request to each bucket. The response tells
   the indexer whether a web page can list that bucket. The indexer keeps only
   the datasets with at least one such bucket. The deploy workflow rebuilds
   the index and redeploys the site every Sunday at 14:00 UTC, so new datasets
   and changes to bucket access appear within a week.
2. **Search.** The app loads `public/data/index.json` (about 300 kB gzipped)
   and searches it in the browser.
3. **Browse.** The app lists the bucket with `ListObjectsV2`, 1,000 entries
   at a time. "About this dataset" opens the registry's full metadata, loaded
   from `public/data/datasets/<slug>.json`. A selected file opens in a panel
   beside the listing. Files under 2 MB are previewed there: JSON as a tree,
   Markdown rendered, and text files as plain text. An HTML file gets an
   "Open in new tab" button instead, which opens it from the bucket. The
   divider resizes the panel.

4. **Bulk download.** Tick files in a folder and download them as one ZIP.
   Leaving the folder clears the selection. The browser fetches each file and
   streams it into the archive (`client-zip`, entries stored, not compressed).
   Chrome and Edge write the ZIP straight to a file you pick, so its size has
   no limit. Other browsers build it in memory, up to 2 GB. "Copy CLI
   commands" gives one `aws s3 cp --no-sign-request` line per file, for
   selections of any size.

About 55% of the registry datasets with a public bucket have a bucket that a
web page can list. The page shows only those datasets. Most of the other
buckets are public but have no CORS configuration, so only the AWS CLI can list
them.

## Scripts

| Script                                       | Does                                         |
| -------------------------------------------- | -------------------------------------------- |
| `npm run dev`                                | Dev server with hot reload                   |
| `npm run build`                              | Typecheck and bundle to `dist/`              |
| `npm run index`                              | Rebuild the dataset index from the registry  |
| `npm run test`                               | Unit and component tests (Vitest)            |
| `npm run test:e2e`                           | Browser tests against the build (Playwright) |
| `npm run typecheck`                          | `tsc --noEmit`                               |
| `npm run lint` / `lint:css` / `format:check` | Static checks                                |

## Layout

```
scripts/      Build time: registry clone, YAML normalisation, bucket probe
src/
  modules/    Testable logic: registry types, search, S3 requests, route
  components/ UI, each with its own .module.css
  state/      Observable stores (route)
  app/        Page layout
e2e/          Playwright specs, with the index and S3 replaced by fixtures
```

## Stack

React 19, Vite, TypeScript (strict), CSS Modules, and the
[Primer](https://primer.style) design system. Tests use Vitest with
happy-dom and Testing Library, and Playwright for end-to-end tests. ESLint,
Prettier, Stylelint, husky and lint-staged run the static checks.

## Licence

[MIT](LICENSE)
