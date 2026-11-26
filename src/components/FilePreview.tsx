import { useEffect, useMemo, useState } from 'react';
import { Flash, Spinner } from '@primer/react';
import { formatBytes } from '../modules/format';
import {
  fetchPreviewText,
  parseJson,
  PREVIEW_LIMIT,
  type PreviewKind,
  type PreviewText,
} from '../modules/preview/preview';
import { JsonTree } from './JsonTree';
import { Markdown } from './Markdown';
import styles from './Panel.module.css';

/** How much of a file that is not valid JSON is shown as text. */
const RAW_SHOWN = 20_000;

interface Props {
  url: string;
  kind: PreviewKind;
}

/** The file's contents, rendered. The text is untrusted, like registry Markdown. */
export function FilePreview({ url, kind }: Props) {
  const [state, setState] = useState<{
    url: string;
    result: PreviewText | null;
    error: string | null;
  } | null>(null);

  useEffect(() => {
    const abort = new AbortController();
    fetchPreviewText(url, PREVIEW_LIMIT, abort.signal).then(
      result => {
        if (!abort.signal.aborted) setState({ url, result, error: null });
      },
      (error: unknown) => {
        if (!abort.signal.aborted) {
          setState({
            url,
            result: null,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      },
    );
    return () => abort.abort();
  }, [url]);

  if (state?.url !== url) {
    return (
      <p className={styles.loading}>
        <Spinner size="small" /> Loading preview…
      </p>
    );
  }
  if (state.error != null || !state.result) {
    return <Flash variant="danger">{state.error}</Flash>;
  }
  if ('tooLarge' in state.result) {
    return (
      <p className={styles.muted}>
        This file is larger than {formatBytes(PREVIEW_LIMIT)}, too large to preview. Download it to
        read it.
      </p>
    );
  }
  const { text } = state.result;
  switch (kind) {
    case 'json':
      return <JsonPreview text={text} />;
    case 'markdown':
      return <Markdown document>{text}</Markdown>;
    case 'text':
      return <pre className={styles.raw}>{text}</pre>;
  }
}

function JsonPreview({ text }: { text: string }) {
  const parsed = useMemo(() => parseJson(text), [text]);
  if (parsed.ok) return <JsonTree value={parsed.value} />;
  return (
    <>
      <Flash variant="warning">This file is not valid JSON: {parsed.error}</Flash>
      <pre className={styles.raw}>
        {text.slice(0, RAW_SHOWN)}
        {text.length > RAW_SHOWN && '\n…'}
      </pre>
    </>
  );
}
