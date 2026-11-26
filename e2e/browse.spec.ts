import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import type { DatasetDetail, DatasetIndex } from '../src/modules/registry/types.ts';

const BUCKET = {
  bucket: 'example-cogs',
  prefix: '',
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
      buckets: [{ ...BUCKET, bucket: 'other-bucket' }],
    },
  ],
};

const DETAIL: DatasetDetail = {
  slug: 'example-imagery',
  name: 'Example Imagery',
  description: 'Imagery for the end-to-end test.',
  descriptionTruncated: false,
  documentation: 'https://example.org/docs',
  contact: 'data@example.org',
  managedBy: 'Example Org',
  updateFrequency: 'Daily',
  license: 'CC BY 4.0',
  citation: null,
  tags: ['satellite imagery'],
  added: '2020-01-01',
  modified: '2026-01-01',
  explore: {},
  buckets: [BUCKET],
  otherResources: [],
  tutorials: [],
  tools: [],
  publications: [],
};

function listing(prefix: string): string {
  const file = (key: string) =>
    `<Contents><Key>${key}</Key><LastModified>2024-01-02T00:00:00.000Z</LastModified>` +
    '<ETag>"x"</ETag><Size>2048</Size></Contents>';
  const body =
    prefix === ''
      ? '<CommonPrefixes><Prefix>2024/</Prefix></CommonPrefixes>' + file('README.md')
      : file('2024/B04.tif');
  return `<?xml version="1.0" encoding="UTF-8"?><ListBucketResult><IsTruncated>false</IsTruncated>${body}</ListBucketResult>`;
}

/** Serves the index and the bucket from fixtures, so the spec needs no network. */
async function useFixtures(page: Page): Promise<void> {
  await page.route('**/data/index.json', route => route.fulfill({ json: INDEX }));
  await page.route('**/data/datasets/*.json', route => route.fulfill({ json: DETAIL }));
  await page.route('https://example-cogs.s3.us-west-2.amazonaws.com/**', route => {
    const url = new URL(route.request().url());
    if (route.request().method() === 'GET' && url.pathname === '/README.md') {
      return route.fulfill({
        headers: { 'access-control-allow-origin': '*' },
        body: '# Example scenes\n\nOne folder per **year**.\n',
      });
    }
    if (route.request().method() === 'GET' && url.pathname !== '/') {
      return route.fulfill({
        headers: { 'access-control-allow-origin': '*' },
        body: 'x'.repeat(2048),
      });
    }
    if (route.request().method() === 'HEAD') {
      return route.fulfill({
        headers: {
          'access-control-allow-origin': '*',
          'content-length': '2048',
          'content-type': 'image/tiff',
        },
      });
    }
    return route.fulfill({
      contentType: 'application/xml',
      headers: { 'access-control-allow-origin': '*' },
      body: listing(url.searchParams.get('prefix') ?? ''),
    });
  });
}

test('search, open a dataset, browse into a folder and select an object', async ({ page }) => {
  await useFixtures(page);
  await page.goto('/');

  await page.getByPlaceholder('Search 2 datasets').fill('imagery');
  await page.getByRole('link', { name: /Example Imagery/ }).click();

  await page.getByRole('button', { name: 'About this dataset' }).click();
  const about = page.getByRole('dialog', { name: 'Example Imagery' });
  await expect(about.getByText('Imagery for the end-to-end test.')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(about).toBeHidden();

  await page.getByRole('link', { name: '2024/', exact: true }).click();
  await page.getByRole('link', { name: 'B04.tif', exact: true }).click();

  await expect(page.getByRole('heading', { name: 'B04.tif' })).toBeVisible();
  await expect(page.getByText('image/tiff')).toBeVisible();
  await expect(page).toHaveURL(/object=2024%2FB04\.tif/);

  // Back leaves the object, then the folder: each step is a history entry.
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'B04.tif' })).toBeHidden();
  await page.goBack();
  await expect(page.getByRole('link', { name: '2024/', exact: true })).toBeVisible();
});

test('a deep link to an object opens it directly', async ({ page }) => {
  await useFixtures(page);
  await page.goto(
    '/?dataset=example-imagery&bucket=example-cogs&prefix=2024%2F&object=2024%2FB04.tif',
  );
  await expect(page.getByRole('heading', { name: 'B04.tif' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'B04.tif', exact: true })).toHaveAttribute(
    'aria-current',
    'true',
  );
});

test('the organisation picker filters, selects and clears', async ({ page }) => {
  await useFixtures(page);
  await page.goto('/');

  await page.getByRole('button', { name: 'All organisations' }).click();
  await page.getByRole('combobox', { name: 'Filter organisations' }).fill('other');
  await page.getByRole('option', { name: /Other Org/ }).click();

  await expect(page).toHaveURL(/org=Other\+Org/);
  await expect(page.getByRole('status')).toHaveText('1 dataset');
  await expect(page.getByRole('button', { name: /^Other Org/ })).toBeVisible();

  await page.getByRole('button', { name: /^Other Org/ }).click();
  await page.getByRole('button', { name: 'All organisations' }).click();
  await expect(page.getByRole('status')).toHaveText('2 datasets');
});

test('selected files download as one ZIP', async ({ page }) => {
  // The save dialog cannot be driven from a test, so take the in-memory path,
  // which ends in an ordinary browser download.
  await page.addInitScript(() => {
    delete (window as { showSaveFilePicker?: unknown }).showSaveFilePicker;
  });
  await useFixtures(page);
  await page.goto('/?dataset=example-imagery&bucket=example-cogs&prefix=2024%2F');

  await page.getByLabel('Select all 1 files in this list').check();
  await expect(page.getByText('1 file selected, 2.05 KB')).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download ZIP' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('example-cogs-2024.zip');
  const path = await download.path();
  const bytes = await readFile(path);
  expect(bytes.subarray(0, 2).toString()).toBe('PK');
  expect(bytes.includes(Buffer.from('B04.tif'))).toBe(true);
  expect(bytes.includes(Buffer.from('x'.repeat(2048)))).toBe(true);
  await expect(page.getByText('Saved 1 file as example-cogs-2024.zip.')).toBeVisible();
});

test('previews a Markdown file in a panel that the divider resizes', async ({ page }) => {
  await useFixtures(page);
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/?dataset=example-imagery&bucket=example-cogs');

  await page.getByRole('link', { name: 'README.md', exact: true }).click();
  const panel = page.getByRole('complementary', { name: 'File' });
  await expect(panel.getByRole('heading', { name: 'Example scenes' })).toBeVisible();
  await expect(panel.locator('strong', { hasText: 'year' })).toBeVisible();

  const divider = page.getByRole('separator', { name: 'Resize the file panel' });
  const before = (await panel.boundingBox())?.width ?? 0;
  const handle = await divider.boundingBox();
  if (!handle) throw new Error('the divider has no box');
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x - 150, handle.y + handle.height / 2, { steps: 5 });
  await page.mouse.up();

  await expect
    .poll(async () => (await panel.boundingBox())?.width ?? 0)
    .toBeCloseTo(before + 150, -1);

  // The width outlives a reload.
  await page.reload();
  await expect(panel.getByRole('heading', { name: 'Example scenes' })).toBeVisible();
  expect((await panel.boundingBox())?.width ?? 0).toBeCloseTo(before + 150, -1);
});
