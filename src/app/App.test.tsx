import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from '@primer/react';
import { PREVIEW_LIMIT } from '../modules/preview/preview';
import type { DatasetDetail, DatasetIndex } from '../modules/registry/types';
import { EMPTY_ROUTE } from '../modules/route/route';
import { routeStore } from '../state/route';
import { clearSelection } from '../state/selection';
import { App } from './App';

const BUCKET = {
  bucket: 'example-cogs',
  prefix: 'scenes/',
  region: 'us-west-2',
  description: 'Scenes',
  access: 'browsable' as const,
};

const INDEX: DatasetIndex = {
  generated: '2026-11-17T00:00:00.000Z',
  registryCommit: null,
  datasets: [
    {
      slug: 'example-imagery',
      name: 'Example Imagery',
      summary: 'Satellite scenes.',
      tags: ['satellite imagery'],
      managedBy: 'Example Org',
      modified: '2026-01-01',
      buckets: [BUCKET],
    },
    {
      slug: 'other-data',
      name: 'Other Data',
      summary: 'Unrelated tables.',
      tags: [],
      managedBy: 'Other Org',
      modified: '2026-01-01',
      buckets: [{ ...BUCKET, bucket: 'other-bucket', prefix: '' }],
    },
  ],
};

const DETAIL: DatasetDetail = {
  slug: 'example-imagery',
  name: 'Example Imagery',
  description: 'Long **description**.',
  descriptionTruncated: false,
  documentation: 'https://example.org/docs',
  contact: 'data@example.org',
  managedBy: '[Example Org](https://example.org)',
  updateFrequency: 'Daily',
  license: 'CC BY 4.0',
  citation: null,
  tags: ['satellite imagery'],
  added: '2020-01-01',
  modified: '2026-01-01',
  explore: {},
  buckets: [BUCKET],
  otherResources: [
    {
      type: 'S3 Bucket',
      identifier: 'arn:aws:s3:::example-inventory',
      region: 'us-west-2',
      description: 'Inventory',
      requesterPays: false,
      accountRequired: false,
      controlledAccess: null,
      access: 'no-cors',
    },
  ],
  tutorials: [],
  tools: [],
  publications: [],
};

/** Object bodies, by key. Other objects answer 404. */
const OBJECTS: Record<string, string> = {
  'docs/catalog.json': JSON.stringify({
    type: 'Catalog',
    id: 'example',
    links: [{ rel: 'self', href: 'https://example.org/catalog.json' }],
  }),
  'docs/README.md': '# Read me\n\nSome **bold** text.\n\n<script>alert(1)</script>\n',
  'docs/broken.json': '{"type": ',
  'docs/notes.txt': 'Line one\n<b>not bold</b>\n',
  'docs/page.html': '<h1>Page</h1><img src="x" onerror="alert(1)">',
  'docs/huge.md': 'x'.repeat(PREVIEW_LIMIT + 1),
};

/** Failures left to serve for the second page of `paged/`. */
let pageTwoFailures = 0;

function listing(prefix: string, token: string | null): Response {
  const file = (key: string) =>
    `<Contents><Key>${key}</Key><LastModified>2024-01-02T00:00:00.000Z</LastModified><ETag>"x"</ETag><Size>2048</Size></Contents>`;
  // Two pages of five files, joined by a continuation token.
  if (prefix === 'paged/') {
    if (token == null) {
      const files = [0, 1, 2, 3, 4].map(i => file(`paged/a_${i}.tif`)).join('');
      return new Response(
        `<ListBucketResult><IsTruncated>true</IsTruncated><NextContinuationToken>two</NextContinuationToken>${files}</ListBucketResult>`,
      );
    }
    if (pageTwoFailures > 0) {
      pageTwoFailures -= 1;
      return new Response('<Error><Code>SlowDown</Code><Message>Slow down.</Message></Error>', {
        status: 503,
      });
    }
    const files = [0, 1, 2, 3, 4].map(i => file(`paged/b_${i}.tif`)).join('');
    return new Response(
      `<ListBucketResult><IsTruncated>false</IsTruncated>${files}</ListBucketResult>`,
    );
  }
  const folders =
    prefix === 'scenes/' ? '<CommonPrefixes><Prefix>scenes/2024/</Prefix></CommonPrefixes>' : '';
  const files =
    prefix === 'scenes/2024/'
      ? file('scenes/2024/B04.tif')
      : prefix === 'scenes/'
        ? file('scenes/README.txt')
        : prefix === 'big/'
          ? Array.from({ length: 5000 }, (_, i) => file(`big/tile_${i}.tif`)).join('')
          : '';
  return new Response(
    `<ListBucketResult><IsTruncated>false</IsTruncated>${folders}${files}</ListBucketResult>`,
  );
}

beforeEach(() => {
  window.history.replaceState(null, '', '/');
  localStorage.clear();
  routeStore.set(EMPTY_ROUTE);
  clearSelection();
  pageTwoFailures = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : input);
      if (url.pathname.endsWith('/data/datasets/example-imagery.json')) {
        return Promise.resolve(Response.json(DETAIL));
      }
      if (init?.method === 'HEAD') {
        return Promise.resolve(
          new Response(null, {
            headers: { 'content-length': '2048', 'content-type': 'image/tiff' },
          }),
        );
      }
      if (url.hostname.endsWith('amazonaws.com') && url.pathname !== '/') {
        const body = OBJECTS[decodeURIComponent(url.pathname.slice(1))];
        return Promise.resolve(new Response(body ?? 'not found', { status: body ? 200 : 404 }));
      }
      if (url.hostname.endsWith('amazonaws.com')) {
        return Promise.resolve(
          listing(url.searchParams.get('prefix') ?? '', url.searchParams.get('continuation-token')),
        );
      }
      return Promise.resolve(new Response('not found', { status: 404 }));
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderApp(index = INDEX) {
  return render(
    <ThemeProvider>
      <App index={index} />
    </ThemeProvider>,
  );
}

/** INDEX, with the first dataset's buckets replaced. */
function withBuckets(buckets: (typeof BUCKET)[]): DatasetIndex {
  const [first, ...rest] = INDEX.datasets;
  if (!first) throw new Error('no dataset');
  return { ...INDEX, datasets: [{ ...first, buckets }, ...rest] };
}

describe('App', () => {
  it('searches, opens a dataset at its prefix, browses a folder and selects an object', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.type(screen.getByPlaceholderText('Search 2 datasets'), 'imagery');
    await user.click(screen.getByRole('link', { name: /Example Imagery/ }));

    expect(window.location.search).toContain('prefix=scenes%2F');
    expect(await screen.findByRole('link', { name: '2024/' })).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Bucket' })).not.toBeInTheDocument();
    // With no file selected there is no file panel, and no divider for it.
    expect(screen.queryByRole('complementary', { name: 'File' })).not.toBeInTheDocument();
    expect(screen.queryByRole('separator')).not.toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: '2024/' }));
    await user.click(await screen.findByRole('link', { name: 'B04.tif' }));

    expect(await screen.findByRole('heading', { name: 'B04.tif' })).toBeInTheDocument();
    expect(await screen.findByText('image/tiff')).toBeInTheDocument();
    expect(screen.getByText('s3://example-cogs/scenes/2024/B04.tif')).toBeInTheDocument();
    // A TIFF has no preview, so there is nothing to switch between.
    expect(screen.queryByRole('button', { name: 'Preview' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Close file' }));
    expect(screen.queryByRole('heading', { name: 'B04.tif' })).not.toBeInTheDocument();
  });

  it('shows the dataset metadata in a dialog', async () => {
    const user = userEvent.setup();
    routeStore.set({ ...EMPTY_ROUTE, dataset: 'example-imagery', bucket: 'example-cogs' });
    renderApp();
    expect(screen.queryByText('description')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'About this dataset' }));
    const dialog = screen.getByRole('dialog', { name: 'Example Imagery' });
    expect(await within(dialog).findByText('description')).toBeInTheDocument();
    // A public bucket that a page cannot list is metadata, not a browse target.
    expect(within(dialog).getByText('arn:aws:s3:::example-inventory')).toBeInTheDocument();
    expect(within(dialog).getByText('CLI only')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    // Following a link inside the dialog closes it.
    await user.click(screen.getByRole('button', { name: 'About this dataset' }));
    await user.click(await screen.findByRole('link', { name: 'satellite imagery' }));
    expect(window.location.search).toContain('tag=satellite+imagery');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('previews a JSON file as a tree, and switches to its details', async () => {
    const user = userEvent.setup();
    routeStore.set({
      ...EMPTY_ROUTE,
      dataset: 'example-imagery',
      bucket: 'example-cogs',
      prefix: 'docs/',
      object: 'docs/catalog.json',
    });
    renderApp();

    expect(await screen.findByText('"Catalog"')).toBeInTheDocument();
    // A small file starts fully open, down to the link objects.
    expect(screen.getByText('"self"')).toBeInTheDocument();

    const item = screen.getByRole('button', { name: /^0\s*:\s*\{$/ });
    expect(item).toHaveAttribute('aria-expanded', 'true');
    await user.click(item);
    expect(screen.getByRole('button', { name: /^0\s*:\s*\{\s*2 keys\s*\}$/ })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(screen.queryByText('"self"')).not.toBeInTheDocument();
    await user.click(item);
    expect(
      screen.getByRole('link', { name: '"https://example.org/catalog.json"' }),
    ).toHaveAttribute('href', 'https://example.org/catalog.json');

    await user.click(screen.getByRole('button', { name: 'Details' }));
    expect(await screen.findByText('s3://example-cogs/docs/catalog.json')).toBeInTheDocument();
    expect(screen.queryByText('"Catalog"')).not.toBeInTheDocument();
  });

  it('renders a Markdown file without its raw HTML', async () => {
    routeStore.set({
      ...EMPTY_ROUTE,
      dataset: 'example-imagery',
      bucket: 'example-cogs',
      prefix: 'docs/',
      object: 'docs/README.md',
    });
    const { container } = renderApp();

    expect(await screen.findByRole('heading', { name: 'Read me' })).toBeInTheDocument();
    expect(screen.getByText('bold').tagName).toBe('STRONG');
    // Raw HTML is dropped, not rendered and not shown as text.
    expect(container.querySelector('script')).toBeNull();
    expect(screen.queryByText(/alert/)).not.toBeInTheDocument();
  });

  it('shows a text file as text, and only the details of an HTML file', async () => {
    routeStore.set({
      ...EMPTY_ROUTE,
      dataset: 'example-imagery',
      bucket: 'example-cogs',
      prefix: 'docs/',
      object: 'docs/notes.txt',
    });
    const { container } = renderApp();
    expect(await screen.findByText(/Line one/)).toHaveTextContent('Line one <b>not bold</b>');
    expect(container.querySelector('b')).toBeNull();

    act(() => routeStore.set({ ...routeStore.get(), object: 'docs/page.html' }));
    const open = await screen.findByRole('link', { name: 'Open in new tab' });
    expect(open).toHaveAttribute(
      'href',
      'https://example-cogs.s3.us-west-2.amazonaws.com/docs/page.html',
    );
    expect(open).toHaveAttribute('target', '_blank');
    expect(screen.getByRole('link', { name: 'Download' })).toBeInTheDocument();
    // Neither the page nor its source is shown, and there is no preview to switch to.
    expect(screen.queryByText(/<h1>/)).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Page' })).not.toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Preview' })).not.toBeInTheDocument();
  });

  it('explains a file that is not valid JSON, and one too large to preview', async () => {
    routeStore.set({
      ...EMPTY_ROUTE,
      dataset: 'example-imagery',
      bucket: 'example-cogs',
      prefix: 'docs/',
      object: 'docs/broken.json',
    });
    renderApp();
    expect(await screen.findByText(/This file is not valid JSON/)).toBeInTheDocument();
    expect(screen.getByText('{"type":')).toBeInTheDocument();

    act(() => routeStore.set({ ...routeStore.get(), object: 'docs/huge.md' }));
    expect(await screen.findByText(/too large to preview/)).toBeInTheDocument();
  });

  it('resizes the file panel from the keyboard and remembers the width', async () => {
    const user = userEvent.setup();
    routeStore.set({
      ...EMPTY_ROUTE,
      dataset: 'example-imagery',
      bucket: 'example-cogs',
      prefix: 'scenes/2024/',
      object: 'scenes/2024/B04.tif',
    });
    renderApp();
    const divider = screen.getByRole('separator', { name: 'Resize the file panel' });
    expect(divider).toHaveAttribute('aria-valuenow', '480');

    divider.focus();
    await user.keyboard('{ArrowLeft}');
    expect(divider).toHaveAttribute('aria-valuenow', '496');
    await user.keyboard('{Home}');
    expect(divider).toHaveAttribute('aria-valuenow', '320');
    expect(localStorage.getItem('detailsPanelWidth')).toBe('320');
  });

  it('offers no bucket choice when the other resources are folders of the same bucket', async () => {
    routeStore.set({
      ...EMPTY_ROUTE,
      dataset: 'example-imagery',
      bucket: 'example-cogs',
      prefix: 'scenes/',
    });
    renderApp(
      withBuckets([BUCKET, { ...BUCKET, prefix: 'scenes/2024/' }, { ...BUCKET, prefix: '' }]),
    );

    expect(await screen.findByRole('link', { name: '2024/' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'example-cogs' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Bucket:/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Bucket' })).not.toBeInTheDocument();
  });

  it('picks between distinct buckets from the bucket crumb', async () => {
    const user = userEvent.setup();
    routeStore.set({
      ...EMPTY_ROUTE,
      dataset: 'example-imagery',
      bucket: 'example-cogs',
      prefix: 'scenes/',
    });
    renderApp(
      withBuckets([
        BUCKET,
        { ...BUCKET, prefix: 'scenes/2024/' },
        { ...BUCKET, bucket: 'example-tables', prefix: 'tables/', region: 'eu-west-1' },
      ]),
    );

    await user.click(await screen.findByRole('button', { name: 'Bucket: example-cogs' }));
    const choices = screen.getAllByRole('menuitemradio');
    expect(choices.map(c => c.textContent)).toEqual([
      expect.stringContaining('example-cogs'),
      expect.stringContaining('example-tables'),
    ]);
    expect(choices[0]).toHaveAttribute('aria-checked', 'true');

    await user.click(screen.getByRole('menuitemradio', { name: /example-tables/ }));
    expect(window.location.search).toContain('bucket=example-tables');
    expect(window.location.search).toContain('prefix=tables%2F');
    expect(
      await screen.findByRole('button', { name: 'Bucket: example-tables' }),
    ).toBeInTheDocument();
  });

  it('filters the datasets to one organisation from the welcome page', async () => {
    const user = userEvent.setup();
    renderApp();
    const organisations = screen.getByRole('heading', { name: 'Organisations' }).closest('section');
    if (!organisations) throw new Error('no Organisations section');

    await user.click(within(organisations).getByRole('link', { name: /Other Org/ }));

    expect(window.location.search).toBe('?org=Other+Org');
    expect(screen.getByRole('status')).toHaveTextContent('1 dataset');
    expect(screen.getByRole('button', { name: /^Other Org/ })).toBeInTheDocument();
  });

  it('selects files for bulk download and clears the selection', async () => {
    const user = userEvent.setup();
    routeStore.set({
      ...EMPTY_ROUTE,
      dataset: 'example-imagery',
      bucket: 'example-cogs',
      prefix: 'scenes/2024/',
    });
    renderApp();

    await user.click(await screen.findByLabelText('Select all 1 files in this list'));
    expect(screen.getByLabelText('Select B04.tif')).toBeChecked();
    expect(screen.getByText('1 file selected, 2.05 KB')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download ZIP' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.queryByText(/selected/)).not.toBeInTheDocument();
    expect(screen.getByLabelText('Select B04.tif')).not.toBeChecked();
  });

  it('keeps the selection while a file is opened, and clears it when the folder is left', async () => {
    const user = userEvent.setup();
    routeStore.set({
      ...EMPTY_ROUTE,
      dataset: 'example-imagery',
      bucket: 'example-cogs',
      prefix: 'scenes/2024/',
    });
    renderApp();

    await user.click(await screen.findByLabelText('Select B04.tif'));
    await user.click(screen.getByRole('link', { name: 'B04.tif' }));
    expect(await screen.findByRole('heading', { name: 'B04.tif' })).toBeInTheDocument();
    expect(screen.getByText('1 file selected, 2.05 KB')).toBeInTheDocument();

    // Up a folder, then back: the selection does not come back with it.
    await user.click(screen.getByRole('link', { name: 'scenes' }));
    expect(await screen.findByRole('link', { name: '2024/' })).toBeInTheDocument();
    expect(screen.queryByText(/selected/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: '2024/' }));
    expect(await screen.findByLabelText('Select B04.tif')).not.toBeChecked();
    expect(screen.queryByText(/selected/)).not.toBeInTheDocument();
  });

  it('filters the loaded names by what they contain, ignoring case', async () => {
    const user = userEvent.setup();
    routeStore.set({
      ...EMPTY_ROUTE,
      dataset: 'example-imagery',
      bucket: 'example-cogs',
      prefix: 'scenes/',
    });
    renderApp();
    const box = await screen.findByRole('textbox', { name: 'Names containing' });
    await screen.findByRole('link', { name: 'README.txt' });

    await user.type(box, 'adm');
    expect(screen.getByRole('link', { name: 'README.txt' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '2024/' })).not.toBeInTheDocument();
    expect(screen.getByText('1 of 2 entries match')).toBeInTheDocument();

    await user.clear(box);
    await user.type(box, 'nothing');
    expect(screen.getByText('No names contain “nothing”.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Clear filter' }));
    expect(screen.getByRole('link', { name: '2024/' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'README.txt' })).toBeInTheDocument();
  });

  it('renders only the rows in view of a long listing, and selects them all', async () => {
    const user = userEvent.setup();
    routeStore.set({
      ...EMPTY_ROUTE,
      dataset: 'example-imagery',
      bucket: 'example-cogs',
      prefix: 'big/',
    });
    renderApp();

    const all = await screen.findByLabelText('Select all 5,000 files in this list');
    const table = screen.getByRole('table');
    expect(table).toHaveAttribute('aria-rowcount', '5002');
    expect(within(table).getAllByRole('row').length).toBeLessThan(100);

    await user.click(all);
    expect(screen.getByText(/^5,000 files selected/)).toBeInTheDocument();
  });

  it('loads the next page by itself when the end of the list is in view', async () => {
    routeStore.set({
      ...EMPTY_ROUTE,
      dataset: 'example-imagery',
      bucket: 'example-cogs',
      prefix: 'paged/',
    });
    renderApp();

    expect(await screen.findByRole('link', { name: 'b_4.tif' })).toBeInTheDocument();
    expect(screen.getByText('10 entries')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Load more/ })).not.toBeInTheDocument();
  });

  it('stops after a failed page and offers a retry', async () => {
    const user = userEvent.setup();
    pageTwoFailures = 1;
    const fetches = vi.mocked(fetch);
    routeStore.set({
      ...EMPTY_ROUTE,
      dataset: 'example-imagery',
      bucket: 'example-cogs',
      prefix: 'paged/',
    });
    renderApp();

    const retry = await screen.findByRole('button', { name: 'Retry' });
    expect(screen.getByText('Slow down.')).toBeInTheDocument();
    const pageTwoRequests = () =>
      fetches.mock.calls.filter(([input]) =>
        (input instanceof Request ? input.url : input.toString()).includes('continuation-token'),
      ).length;
    expect(pageTwoRequests()).toBe(1);

    await user.click(retry);
    expect(await screen.findByRole('link', { name: 'b_4.tif' })).toBeInTheDocument();
    expect(pageTwoRequests()).toBe(2);
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  });

  it('copies the HTTPS URL of a file from its row', async () => {
    const user = userEvent.setup();
    routeStore.set({
      ...EMPTY_ROUTE,
      dataset: 'example-imagery',
      bucket: 'example-cogs',
      prefix: 'scenes/2024/',
    });
    renderApp();

    await user.click(await screen.findByRole('button', { name: 'Copy URL of B04.tif' }));
    expect(await navigator.clipboard.readText()).toMatch(
      /^https:\/\/example-cogs\.s3\.[\w-]+\.amazonaws\.com\/scenes\/2024\/B04\.tif$/,
    );
    expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument();
  });

  it('explains a link to a dataset that is not in the index', async () => {
    routeStore.set({ ...EMPTY_ROUTE, dataset: 'cli-only', bucket: 'no-cors-bucket' });
    renderApp();
    expect(
      await screen.findByText(
        /The page shows only datasets with a bucket that a web page can list/,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});
