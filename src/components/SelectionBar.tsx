import { useMemo, useRef, useState } from 'react';
import { Button, Flash, ProgressBar } from '@primer/react';
import { DownloadIcon, XIcon } from '@primer/octicons-react';
import {
  canStreamToDisk,
  cliCommands,
  MEMORY_LIMIT,
  pickTarget,
  zipName,
  zipToDownload,
  zipToFile,
  type Progress,
  type ZipRequest,
} from '../modules/download/zip';
import { formatBytes } from '../modules/format';
import type { S3Object } from '../modules/s3/list';
import { clearSelection } from '../state/selection';
import { CopyButton } from './CopyButton';
import styles from './SelectionBar.module.css';

interface Props {
  bucket: string;
  region: string;
  objects: S3Object[];
}

/** Progress updates arrive per network chunk; repainting on each one is wasted work. */
const PROGRESS_INTERVAL_MS = 150;

type Outcome = { variant: 'success' | 'danger' | 'default'; text: string };

/** The bulk-download actions for the picked files, with progress while a ZIP is written. */
export function SelectionBar({ bucket, region, objects }: Props) {
  const [running, setRunning] = useState<AbortController | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const lastPaint = useRef(0);
  // Tens of thousands of lines for a large selection; not on every progress tick.
  const commands = useMemo(() => cliCommands(bucket, objects), [bucket, objects]);
  const total = useMemo(() => objects.reduce((sum, o) => sum + o.size, 0), [objects]);

  if (objects.length === 0 && !running && !outcome) return null;

  const tooBig = !canStreamToDisk() && total > MEMORY_LIMIT;
  const files = `${objects.length.toLocaleString()} ${objects.length === 1 ? 'file' : 'files'}`;

  const download = async () => {
    const name = zipName(
      bucket,
      objects.map(o => o.key),
    );
    const abort = new AbortController();
    const request: ZipRequest = {
      bucket,
      region,
      objects,
      signal: abort.signal,
      onProgress: next => {
        const now = performance.now();
        if (now - lastPaint.current < PROGRESS_INTERVAL_MS && next.bytes < next.total) return;
        lastPaint.current = now;
        setProgress(next);
      },
    };
    setOutcome(null);
    try {
      if (canStreamToDisk()) {
        // The picker needs the click's user gesture, so it comes before any other await.
        const target = await pickTarget(name);
        if (!target) return;
        setRunning(abort);
        await zipToFile(target, request);
      } else {
        setRunning(abort);
        await zipToDownload(name, request);
      }
      setOutcome({ variant: 'success', text: `Saved ${files} as ${name}.` });
    } catch (error) {
      setOutcome(
        abort.signal.aborted
          ? { variant: 'default', text: 'Download cancelled.' }
          : { variant: 'danger', text: error instanceof Error ? error.message : String(error) },
      );
    } finally {
      setRunning(null);
      setProgress(null);
    }
  };

  const percent = progress && progress.total > 0 ? (progress.bytes / progress.total) * 100 : 0;

  return (
    <section className={styles.bar} aria-label="Selected files">
      {objects.length > 0 && (
        <div className={styles.row}>
          <strong>
            {files} selected, {formatBytes(total)}
          </strong>
          <div className={styles.actions}>
            <Button
              variant="primary"
              size="small"
              leadingVisual={DownloadIcon}
              disabled={running != null || tooBig}
              onClick={download}
            >
              Download ZIP
            </Button>
            <CopyButton value={commands} label="Copy CLI commands" showLabel />
            <Button
              size="small"
              variant="invisible"
              leadingVisual={XIcon}
              disabled={running != null}
              onClick={() => {
                clearSelection();
                setOutcome(null);
              }}
            >
              Clear
            </Button>
          </div>
        </div>
      )}

      {tooBig && (
        <p className={styles.note}>
          This browser builds a ZIP in memory, so it is limited to {formatBytes(MEMORY_LIMIT)}.
          Chrome and Edge can save a ZIP of any size, or copy the CLI commands.
        </p>
      )}

      {running && (
        <div className={styles.progress}>
          <ProgressBar
            progress={percent}
            aria-label={`Downloaded ${formatBytes(progress?.bytes ?? 0)} of ${formatBytes(total)}`}
          />
          <div className={styles.row}>
            <span className={styles.current}>
              {formatBytes(progress?.bytes ?? 0)} of {formatBytes(progress?.total ?? total)}
              {progress ? `: ${progress.current}` : ''}
            </span>
            <Button size="small" onClick={() => running.abort()}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {outcome && <Flash variant={outcome.variant}>{outcome.text}</Flash>}
    </section>
  );
}
