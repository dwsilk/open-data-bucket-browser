import { useEffect, useState } from 'react';
import { Button, Heading, IconButton, SegmentedControl } from '@primer/react';
import { DownloadIcon, LinkExternalIcon, XIcon } from '@primer/octicons-react';
import { formatBytes, formatDate } from '../modules/format';
import { isHtml, previewKind } from '../modules/preview/preview';
import { headObject, type ObjectHead } from '../modules/s3/list';
import { cliCopy, objectUrl, s3Uri } from '../modules/s3/urls';
import { navigate } from '../state/route';
import { CopyButton } from './CopyButton';
import { FilePreview } from './FilePreview';
import styles from './Panel.module.css';

interface Props {
  bucket: string;
  region: string;
  objectKey: string;
}

type View = 'preview' | 'details';

/**
 * The selected object: a preview of a JSON or Markdown file, and the details
 * of any file. The view chosen stays the same from one file to the next.
 */
export function ObjectDetails({ bucket, region, objectKey }: Props) {
  const [view, setView] = useState<View>('preview');
  const kind = previewKind(objectKey);
  const name = objectKey.slice(objectKey.lastIndexOf('/') + 1) || objectKey;
  const https = objectUrl(bucket, region, objectKey);

  return (
    <section className={styles.file} aria-labelledby="object-heading">
      <div className={styles.fileHeader}>
        <div className={styles.sectionHeader}>
          <Heading as="h2" id="object-heading" className={styles.heading}>
            {name}
          </Heading>
          <IconButton
            size="small"
            variant="invisible"
            icon={XIcon}
            aria-label="Close file"
            onClick={() => navigate({ object: null })}
          />
        </div>
        {kind != null && (
          <SegmentedControl
            aria-label="Show"
            size="small"
            onChange={selected => setView(selected === 0 ? 'preview' : 'details')}
          >
            <SegmentedControl.Button selected={view === 'preview'}>Preview</SegmentedControl.Button>
            <SegmentedControl.Button selected={view === 'details'}>Details</SegmentedControl.Button>
          </SegmentedControl>
        )}
      </div>

      <div className={styles.fileBody}>
        {kind != null && view === 'preview' ? (
          <FilePreview url={https} kind={kind} />
        ) : (
          <Details bucket={bucket} region={region} objectKey={objectKey} https={https} />
        )}
      </div>
    </section>
  );
}

/**
 * Size, type and date come from a HEAD request rather than the listing, so a
 * deep link to an object works before, or without, the folder around it
 * being listed.
 */
function Details({ bucket, region, objectKey, https }: Props & { https: string }) {
  const [head, setHead] = useState<{ key: string; value: ObjectHead | null } | null>(null);

  useEffect(() => {
    const abort = new AbortController();
    void headObject(bucket, region, objectKey, abort.signal).then(value => {
      if (!abort.signal.aborted) setHead({ key: objectKey, value });
    });
    return () => abort.abort();
  }, [bucket, region, objectKey]);

  const info = head?.key === objectKey ? head.value : undefined;
  const uri = s3Uri(bucket, objectKey);
  const cli = cliCopy(bucket, objectKey);

  return (
    <>
      <dl className={styles.fields}>
        <dt>Size</dt>
        <dd>
          {info === undefined ? '…' : info?.size != null ? formatBytes(info.size) : 'Unknown'}
        </dd>
        <dt>Type</dt>
        <dd>{info === undefined ? '…' : (info?.contentType ?? 'Unknown')}</dd>
        <dt>Last modified</dt>
        <dd>
          {info === undefined
            ? '…'
            : info?.lastModified != null
              ? formatDate(info.lastModified, true)
              : 'Unknown'}
        </dd>
        <dt>S3 URI</dt>
        <dd className={styles.copyable}>
          <code>{uri}</code>
          <CopyButton value={uri} label="Copy S3 URI" />
        </dd>
        <dt>HTTPS URL</dt>
        <dd className={styles.copyable}>
          <code>{https}</code>
          <CopyButton value={https} label="Copy HTTPS URL" />
        </dd>
        <dt>AWS CLI</dt>
        <dd className={styles.copyable}>
          <code>{cli}</code>
          <CopyButton value={cli} label="Copy CLI command" />
        </dd>
      </dl>

      <div className={styles.actions}>
        <Button as="a" href={https} leadingVisual={DownloadIcon}>
          Download
        </Button>
        {isHtml(objectKey) && (
          <Button
            as="a"
            href={https}
            target="_blank"
            rel="noreferrer"
            leadingVisual={LinkExternalIcon}
          >
            Open in new tab
          </Button>
        )}
      </div>
    </>
  );
}
